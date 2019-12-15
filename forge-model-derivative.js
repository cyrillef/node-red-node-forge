// Copyright (c) Autodesk, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/* jshint esversion: 8 */

module.exports = function (RED) {
    "use strict";
    var utils = require('./utils');
    var ForgeAPI = require('forge-apis');
    
    // Forge
    function ForgeModelDerivativeNode(n) {
        RED.nodes.createNode(this, n);
        this.forgeCredentials = RED.nodes.getNode(n.forge);
        this.mdProperties = n;
        var node = this;

        function onInput(msg) {

            if (msg.nodeFlowId) {
                var flowNode = RED.nodes.getNode(msg.nodeFlowId);
                if (flowNode) {
                    msg.flowid = flowNode.z;
                    delete msg.nodeFlowId;
                }
            }

            var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
            //RED.nodes.getNode('forge-credentials');
            if (!FORGE) {
                if (node._forgeCredentials) {
                    delete node._forgeCredentials;
                    node.warn(RED._('forge.warn.missing-credentials'));
                    return;
                }
                node._forgeCredentials = true;
                var forgeDefaultCredentials = null;
                RED.nodes.eachNode((elt) => { // elt.type === 'forge-*'
                    // https://discourse.nodered.org/t/how-to-get-flow-id-by-function-node/9889
                    if (node._forgeCredentials && elt.type === 'forge-default-credentials') {
                        if (![node.z, msg.flowid].includes(elt.z)) {
                            forgeDefaultCredentials = elt.id;
                            return;
                        }
                        node.forgeCredentials = RED.nodes.getNode(elt.id).forgeCredentials;
                        onInput(msg);
                        if (node.forgeCredentials.FORGE) {
                            delete node._forgeCredentials;
                            forgeDefaultCredentials = null;
                        }
                    }
                });
                if (forgeDefaultCredentials) {
                    node.forgeCredentials = RED.nodes.getNode(forgeDefaultCredentials).forgeCredentials;
                    onInput(msg);
                    forgeDefaultCredentials = null;
                }
                if (node._forgeCredentials)
                    delete node._forgeCredentials;
                return;
            }

            node.sendMsg = function (err, data) {
                if (err) {
                    var text = 'error';
                    if (err.statusCode)
                        text = `${err.statusCode}: ${err.statusMessage}`;
                    else if (err.message)
                        text = err.message;

                    node.status({
                        fill: 'red',
                        shape: 'ring',
                        text: text
                    });
                    //node.error('failed: ' + err.toString(), msg);
                    var msgErr = {
                        err: err
                    };
                    var keys = Object.keys(msg);
                    for (var i = 0; i < keys.length; i++) {
                        var key = keys[i];
                        if (['payload', '_msgid', '__proto__'].includes(key) || msgErr.hasOwnProperty(key))
                            continue;
                        msgErr[key] = msg[key];
                    }
                    msgErr.err.op = 'md:' + node.mdProperties.operation;
                    node.send([null, msgErr]);
                    return;
                }

                msg.payload = data;
                node.status({});
                msg.topic = node.mdProperties.topic || node.topic;
				msg.op ='md:' + node.mdProperties.operation;
                node.send([msg, null]);
            };

            var _cb = function (err, data) {
                node.sendMsg(err, data);
            };

            if (typeof service[node.mdProperties.operation] === 'function') {
                node.status({
                    fill: 'blue',
                    shape: 'dot',
                    text: node.mdProperties.operation
                });
                service[node.mdProperties.operation](n, node, FORGE, msg, _cb);
            } else {
                node.error(RED._('forge.error.unknown-operation', {
                    op: node.mdProperties.operation
                }));
            }
        }

        node.on('input', onInput);

    }

    RED.nodes.registerType('forge-model-derivative', ForgeModelDerivativeNode);

    var service = {};
    utils(service);

    // #region --- Model Derivative ---

    // POST	job
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/job-POST/
    service.TranslateParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            xAdsForce: {
                default: [false]
            },
            rootFilename: service.defaultNullOrEmptyString,
            checkReferences: service.defaultNullOrEmptyString,
            region: service.asIs,
            datacenter: service.asIs,
            workflow: service.defaultNullOrEmptyString,
            workflowAttribute: service.defaultNullOrEmptyString,
            raw: service.defaultNullOrEmptyBoolean
        }, params);
        if (params.hasOwnProperty('rootFilename'))
            params.compressedUrn = true;

        return (params);
    };

    service.Translate = function (n, node, oa2legged, msg, cb) {
        var params = service.TranslateParams(n, msg);

        var jobs = {
            input: {
                urn: params.urn,
                // compressedUrn: params.compressedUrn,
                // rootFilename: params.rootFilename,
                checkReferences: params.checkReferences,
            },
            output: {
                destination: {
                    region: params.region
                },
                formats: node.mdProperties.jobs
            }
        };
        if (params.hasOwnProperty('rootFilename')) {
            jobs.input.compressedUrn = true;
            jobs.input.rootFilename = params.rootFilename;
        }
        if (params.hasOwnProperty('workflow')) {
            jobs.misc = {};
            jobs.misc.workflow = params.workflow;
            try {
                jobs.misc.workflowAttribute = JSON.parse(params.workflowAttribute);
            } catch ( ex ) {
                jobs.misc.workflowAttribute = params.workflowAttribute;
            }
        }

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.translate(jobs, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/manifest
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-GET/
    service.GetManifestParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            acceptEncoding: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetManifest = function (n, node, oa2legged, msg, cb) {
        var params = service.GetManifestParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getManifest(params.urn, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // DELETE	:urn/manifest
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-DELETE/
    service.DeleteManifestParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.DeleteManifest = function (n, node, oa2legged, msg, cb) {
        var params = service.DeleteManifestParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.deleteManifest(params.urn, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/metadata
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-metadata-GET/
    service.GetMetadataParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            acceptEncoding: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetMetadata = function (n, node, oa2legged, msg, cb) {
        var params = service.GetMetadataParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getMetadata(params.urn, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/metadata/:guid
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-metadata-guid-GET/
    service.GetObjectTreeParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            forceget: {
                default: [false]
            },
            guid: service.asIs,
            acceptEncoding: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetObjectTree = function (n, node, oa2legged, msg, cb) {
        var params = service.GetObjectTreeParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getModelviewMetadata(params.urn, params.guid, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/metadata/:guid/properties
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-metadata-guid-properties-GET/
    service.GetPropertiesParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            forceget: {
                default: [false]
            },
            guid: service.asIs,
            objectid: service.defaultNullOrEmptyString,
            acceptEncoding: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetProperties = function (n, node, oa2legged, msg, cb) {
        var params = service.GetPropertiesParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getModelviewProperties(params.urn, params.guid, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // POST	references
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-references-POST/
    service.SetReferencesParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            region: service.asIs,
            datacenter: service.asIs,
            rootFilename: {
                rename: 'filename'
            },
            references: service.defaultNullOrEmptyString,
            raw: service.defaultNullOrEmptyBoolean
        }, params);
        try {
            if (params.references)
                params.references = JSON.parse(params.references);
        } catch (ex) {
            delete params.references;
        }

        return (params);
    };

    service.SetReferences = function (n, node, oa2legged, msg, cb) {
        var params = service.SetReferencesParams(n, msg);

        //var returnType = null;
        var urn = params.urn;
        params.urn = service.safeBase64decode(params.urn);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        // apis.apiClient.callApi(
        //         '/modelderivative/v2/designdata/' + urn + '/references', 'POST', {}, {}, {}, {}, params,
        //         ['application/json'], ['application/vnd.api+json', 'application/json'],
        //         returnType, oa2legged, oa2legged.getCredentials()
        //     )
        apis.setReferences(urn, params.references, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/thumbnail
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-thumbnail-GET/
    service.GetThumbnailParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            width: service.asIs,
            height: service.asIs,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetThumbnail = function (n, node, oa2legged, msg, cb) {
        var params = service.GetThumbnailParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getThumbnail(params.urn, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	:urn/manifest/:derivativeurn
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-derivativeurn-GET/
    service.GetDerivativeManifestParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            urn: service.asIs,
            derivativeurn: service.asIs,
            range: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetDerivativeManifest = function (n, node, oa2legged, msg, cb) {
        var params = service.GetDerivativeManifestParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getDerivativeManifest(params.urn, params.derivativeurn, params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // GET	formats
    // https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/formats-GET/
    service.GetFormatsParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
        service.getParams(n, msg, {
            ifModifiedSince: service.defaultNullOrEmptyDate,
            acceptEncoding: service.defaultNullOrEmptyString,
            datacenter: service.asIs,
            raw: service.defaultNullOrEmptyBoolean
        }, params);

        return (params);
    };

    service.GetFormats = function (n, node, oa2legged, msg, cb) {
        var params = service.GetFormatsParams(n, msg);

        var apis = new ForgeAPI.DerivativesApi(undefined, params.datacenter);
        apis.getFormats(params, oa2legged, oa2legged.getCredentials())
            .then(function (results) {
                cb(null, service.formatResponseOldSDK(results, params.raw));
            })
            .catch(function (error) {
                cb(service.formatErrorOldSDK(error), null);
            });
    };

    // #endregion

};