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

module.exports = function (RED) {
    "use strict";
    var url = require('url');
    var fs = require('fs');
    var uuidv4 = require('uuid/v4');
    var streamBuffers = require('stream-buffers');
    var ForgeAPI = require('forge-apis');

    // Forge
    function ForgeBucketNode(n) {
        RED.nodes.createNode(this, n);
        this.forgeCredentials = RED.nodes.getNode(n.forge);
        this.ossProperties = n;
        var node = this;

        // Internal state
        // var _processing = false;
        // var _originalParams = null;
        // var _outputs = [];

        function onInput0(msg) {
            //msg.topic = node.topic;
            //var _msg = RED.util.cloneMessage(msg);

            var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
            if (!FORGE) {
                node.warn(RED._("forge.warn.missing-credentials"));
                return;
            }

            node.sendMsg = function (err, data) {
                if (err) {
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: "error"
                    });
                    //node.error("failed: " + err.toString(), msg);
                    node.send([null, {
                        err: err
                    }]);
                    return;
                }

                msg.payload = data;
                node.status({});
                msg.topic = node.topic;
                node.send([msg, null]);
            };

            var _cb = function (err, data) {
                node.sendMsg(err, data);
            };

            if (typeof service[node.ossProperties.operation] === "function") {
                node.status({
                    fill: "blue",
                    shape: "dot",
                    text: node.ossProperties.operation
                });
                service[node.ossProperties.operation](n, node, FORGE, msg, _cb);
            } else {
                node.error(RED._("forge.error.unknown-operation", {
                    op: node.ossProperties.operation
                }));
            }
        }

        function sendNext(msg, credentials) {
            //var output = RED.util.cloneMessage(_originalMsg);

            var _cb = function (err, data) {
                //node.sendMsg(err, data);
                msg.payload = data;
                node.send([msg, null]);
            };

            if (_processing === false || msg.payload.startAt !== undefined) {
                _processing = true;
                //node.send([output, null]);
                service[node.ossProperties.operation](n, node, credentials, msg, _cb);
            } else { // Finished
                _processing = false;
                _originalParams = null;

                msg.payload = _outputs;

                node.send([null, msg]);
            }
        }

        function onInput(msg) {
            //msg.topic = node.topic;
            var _msg = RED.util.cloneMessage(msg);

            var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
            if (!FORGE) {
                node.warn(RED._("forge.warn.missing-credentials"));
                return;
            }

            if (!_processing) {
                _originalParams = service[node.ossProperties.operation + 'Params'](n, msg);
                _outputs = [];
            } else {
                _outputs.push(_msg.payload);
                _originalParams.startAt = _msg.payload.body.nextKey;
                msg.payload = _originalParams;
            }

            sendNext(msg, FORGE);
        }

        node.on("input", onInput0);

    }

    RED.nodes.registerType("forge-oss", ForgeBucketNode);

    var service = {};

    service.BucketKey = function (src, out) {
        try {
            if ((src.bucketType === null && src.bucket === "") || src.bucketType === 'none') {
                src.bucketType = "env";
                src.bucket = "FORGE_BUCKET";
            }
            out.bucket = RED.util.evaluateNodeProperty(src.bucket, src.bucketType, src, out);
        } catch (err) {
            out.bucket = src.bucket;
        }
    };

    // GET	buckets
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-GET/
    service.ListBucketsParams = function (n, msg) {
        var params = {};

        //service.getParamsSimple(n, msg, ["limit", "startAt", "region"], params);
        service.getParams(n, msg, {
            limit: {
                type: "number",
                default: [10],
                min: 0,
                max: 100
            },
            startAt: service.defaultNullOrEmptyString,
            region: {
                default: ["US"]
            }
        }, params);
        return (params);
    };

    service.ListBuckets = function (n, node, oa2legged, msg, cb) {
        var params = service.ListBucketsParams(n, msg);

        var ossBuckets = new ForgeAPI.BucketsApi();
        ossBuckets.getBuckets(params, oa2legged, oa2legged.getCredentials())
            .then(function (buckets) {
                //console.log(JSON.stringify(buckets.body.items, null, 4));
                if (!buckets.body.hasOwnProperty('next')) {
                    cb(null, buckets);
                } else {
                    var url_parts = url.parse(buckets.body.next, true);
                    buckets.body.nextKey = url_parts.query.startAt;
                    buckets.body.limit = url_parts.query.limit;
                    buckets.body.region = params.region;
                    cb(null, buckets);
                }
            })
            .catch(function (error) {
                cb(error, null);
            });
    };

    // GET	buckets/:bucketKey/details
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-details-GET/
    service.BucketDetailsParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);
        return (params);
    };

    service.BucketDetails = function (n, node, oa2legged, msg, cb) {
        var params = service.BucketDetailsParams(n, msg);

        var ossBuckets = new ForgeAPI.BucketsApi();
        ossBuckets.getBucketDetails(params.bucket, oa2legged, oa2legged.getCredentials())
            .then(function (bucket) {
                //console.log(JSON.stringify(buckets.body.items, null, 4));
                cb(null, bucket);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // POST	buckets
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-details-GET/
    service.CreateBucketParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            policyKey: service.asIs,
            region: {
                rename: 'xAdsRegion'
            }
        }, params);

        return (params);
    };

    service.CreateBucket = function (n, node, oa2legged, msg, cb) {
        var params = service.CreateBucketParams(n, msg);

        var postBuckets = {
            bucketKey: params.bucket,
            policyKey: params.policyKey
        };

        var ossBuckets = new ForgeAPI.BucketsApi();
        ossBuckets.createBucket(postBuckets, params, oa2legged, oa2legged.getCredentials())
            .then(function (bucket) {
                //console.log(JSON.stringify(buckets.body.items, null, 4));
                cb(null, bucket);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // DELETE	buckets/:bucketKey
    // undocumented
    service.DeleteBucketParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);
        return (params);
    };

    service.DeleteBucket = function (n, node, oa2legged, msg, cb) {
        var params = service.DeleteBucketParams(n, msg);

        var ossBuckets = new ForgeAPI.BucketsApi();
        ossBuckets.deleteBucket(params.bucket, oa2legged, oa2legged.getCredentials())
            .then(function (bucket) {
                //console.log(JSON.stringify(buckets.body.items, null, 4));
                cb(null, bucket);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // GET	buckets/:bucketKey/objects
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-GET/
    service.ListObjectsParams = function (n, msg) {
        var params = {};

        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        //service.getParamsSimple(n, msg, ["limit", "startAt", "beginsWidth"], params);
        service.getParams(n, msg, {
            limit: {
                type: "number",
                default: [10],
                min: 0,
                max: 100
            },
            startAt: service.defaultNullOrEmptyString,
            beginsWith: service.defaultNullOrEmptyString
        }, params);
        return (params);
    };

    service.ListObjects = function (n, node, oa2legged, msg, cb) {
        var params = service.ListObjectsParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.getObjects(params.bucket, params, oa2legged, oa2legged.getCredentials())
            .then(function (objects) {
                //console.log(JSON.stringify(objects.body.items, null, 4));
                if (!objects.body.hasOwnProperty('next')) {
                    cb(null, objects);
                } else {
                    var url_parts = url.parse(objects.body.next, true);
                    objects.body.nextKey = url_parts.query.startAt;
                    objects.body.limit = params.limit || 10;
                    objects.body.beginsWidth = params.beginsWidth || "";
                    cb(null, objects);
                }
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // GET	buckets/:bucketKey/objects/:objectName/details
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-details-GET/
    service.ObjectDetailsParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs,
            with: {
                type: "string",
                default: [null, ""],
                rename: "_with"
            },
            ifModifiedSince: service.defaultNullOrEmptyDate
        }, params);

        return (params);
    };

    service.ObjectDetails = function (n, node, oa2legged, msg, cb) {
        var params = service.ObjectDetailsParams(n, msg);

        // cyrille todo:
        if (params._width)
            params._width = params._with[0];

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.getObjectDetails(params.bucket, params.key, params, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // GET	buckets/:bucketKey/objects/:objectName
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-GET/
    service.GetObjectParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs,
            range: service.defaultNullOrEmptyString,
            ifNoneMatch: service.defaultNullOrEmptyString,
            ifModifiedSince: service.defaultNullOrEmptyDate,
            acceptEncoding: service.defaultNullOrEmptyString
        }, params);

        return (params);
    };

    service.GetObject = function (n, node, oa2legged, msg, cb) {
        var params = service.GetObjectParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.getObject(params.bucket, params.key, params, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
    };

    // PutObject
    // PUT	buckets/:bucketKey/objects/:objectName
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-PUT/
    // GET	buckets/:bucketKey/objects/:objectName/status/:sessionId
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-status-:sessionId-GET/
    // PUT	buckets/:bucketKey/objects/:objectName/resumable
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-resumable-PUT/
    service.PutObjectParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs,
            localFilename: service.asIs,
            ifMatch: service.defaultNullOrEmptyString,
            contentType: service.defaultNullOrEmptyString,
            contentDisposition: service.defaultNullOrEmptyString
        }, params);

        if ((params.localFilename === null || params.localFilename === "") &&
            ((msg.topic === 'body' || msg.topic === 'content') &&
                (typeof msg.payload === 'string' || typeof msg.payload === 'object' || Buffer.isBuffer(msg.payload)))
        ) {
            if (typeof msg.payload === "object" && !Buffer.isBuffer(msg.payload))
                params.buffer = Buffer.from(JSON.stringify(msg.payload), 'utf8');
            else if (typeof msg.payload === "string")
                params.buffer = Buffer.from(msg.payload, 'utf8');
            else
                params.buffer = msg.payload;
        } else if ((params.localFilename === null || params.localFilename === "") &&
            msg.payload.content &&
            (typeof msg.payload.content === 'string' || typeof msg.payload.content === 'object' || Buffer.isBuffer(msg.payload.content))
        ) {
            if (typeof msg.payload.content === "object" && !Buffer.isBuffer(msg.payload.content))
                params.buffer = Buffer.from(JSON.stringify(msg.payload.content), 'utf8');
            else if (typeof msg.payload.content === "string")
                params.buffer = Buffer.from(msg.payload.content, 'utf8');
            else
                params.buffer = msg.payload.content;
        } else if ((params.localFilename === null || params.localFilename === "") && Buffer.isBuffer(msg.payload)) {
            params.buffer = msg.payload;
        }

        return (params);
    };

    service.PutObject = function (n, node, oa2legged, msg, cb) {
        var params = service.PutObjectParams(n, msg);

        service.PutObject_put(oa2legged, params)
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    service.chunkSize = 5 * 1024 * 1024; // 5Mb
    service.minChunkSize = 2 * 1024 * 1024; // 2Mb

    service.PutObject_full = function (oa2legged, options, size, rstream) {
        return (new Promise(function (fulfill, reject) {
            var ossObjects = new ForgeAPI.ObjectsApi();
            ossObjects.uploadObject(options.bucket, options.key, size, rstream, options, oa2legged, oa2legged.getCredentials())
                .then(function (result) {
                    fulfill(result);
                })
                .catch(function (error) {
                    reject(error);
                });
        }));
    };

    service.PutObject_put = function (oa2legged, options) {
        return (new Promise(function (fulfillMaster, rejectMaster) {
            var ossObjects = new ForgeAPI.ObjectsApi();
            service.filesize(options.localFilename, options.buffer)
                .then(function (size) {
                    if (size <= 0)
                        throw new Error('Object size is empty!');
                    if (size <= service.chunkSize) {
                        var rstream = null;
                        if (options.localFilename !== "") {
                            rstream = fs.createReadStream(options.localFilename);
                        } else {
                            rstream = new streamBuffers.ReadableStreamBuffer({
                                frequency: 10, // in milliseconds.
                                chunkSize: 2048 // in bytes.
                            });
                            rstream.put(options.buffer);
                        }
                        return (service.PutObject_full(oa2legged, options, size, rstream));
                    }
                    var nb = Math.floor(size / service.chunkSize);
                    if ((size % service.chunkSize) !== 0)
                        nb++;
                    var arr = [];
                    var uuid = uuidv4();
                    for (var i = 0; i < nb; i++) {
                        var start = i * service.chunkSize;
                        var end = start + service.chunkSize - 1;
                        if (end > size - 1)
                            end = size - 1;
                        var opts = {
                            ContentRange: 'bytes ' + start + '-' + end + '/' + size,
                            size: end - start + 1,
                            start: start,
                            end: end
                        };

                        // Still in parallel, but results processed in series with 'utils.promiseSerie'
                        //arr.push (ossObjects.uploadChunk (bucketKey, ossname, service.chunkSize, opts.ContentRange, sessionId, rstream, {}, oa2legged, oa2legged.getCredentials ())) ;

                        arr.push({
                            opts: opts,
                            options: options,
                            bucket: options.bucket,
                            key: options.key,
                            sessionId: uuid,
                            oa2legged: oa2legged
                        });
                    }

                    return (service.promiseSerie(arr, function (item, index) {
                        return (new Promise(function (fulfill, reject) {
                            // If still in parallel, but results processed in series with 'utils.promiseSerie', use item.then()

                            //console.log (JSON.stringify (item, null, 4)) ;
                            var rstream = null;
                            if (options.localFilename === "") {
                                fs.createReadStream(options.localFilename, {
                                    start: item.opts.start,
                                    end: item.opts.end
                                });
                            } else {
                                rstream = new streamBuffers.ReadableStreamBuffer({
                                    frequency: 10, // in milliseconds.
                                    chunkSize: 2048 // in bytes.
                                });
                                rstream.put(options.buffer.slice(item.opts.start, item.opts.end));
                            }
                            ossObjects.uploadChunk(item.bucket, item.key, item.opts.size, item.opts.ContentRange, item.sessionId, rstream, item.options, item.oa2legged, item.oa2legged.getCredentials())
                                .then(function (content) {
                                    //console.log('Chunk ' + item.opts.ContentRange + ' accepted...');
                                    if (content.statusCode === 202)
                                        return (fulfill(item.opts.ContentRange));
                                    fulfill(content);
                                })
                                .catch(function (error) {
                                    reject(error);
                                });
                        }));
                    }));

                })
                .then(function (info) {
                    if (Array.isArray(info))
                        info = info.pop();
                    fulfillMaster(info);
                })
                .catch(function (error) {
                    rejectMaster(error);
                });
        }));
    };

    // DELETE	buckets/:bucketKey/objects/:objectName
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-DELETE/
    service.DeleteObjectParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs
        }, params);

        return (params);
    };

    service.DeleteObject = function (n, node, oa2legged, msg, cb) {
        var params = service.DeleteObjectParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.deleteObject(params.bucket, params.key, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    // POST	buckets/:bucketKey/objects/:objectName/signed
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-signed-POST/
    service.CreateSignatureParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs,
            access: service.asIs,
            singleUse: service.asIs,
            minutesExpiration: service.asIs
        }, params);

        return (params);
    };

    service.CreateSignature = function (n, node, oa2legged, msg, cb) {
        var params = service.CreateSignatureParams(n, msg);

        var postBucketsSigned = {};
        service.getParams(n, msg, {
            singleUse: service.asIs,
            minutesExpiration: service.asIs
        }, postBucketsSigned);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.createSignedResource(params.bucket, params.key, postBucketsSigned, params, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                var url_parts = url.parse(obj.body.signedUrl, true);
                obj.body.guid = url_parts.pathname.split('/').pop();
                obj.body.region = url_parts.query.region || 'US';
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        // cb(null, params);
    };

    // PUT	signedresources/:id
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/signedresources-:id-PUT/
    service.PutSignedObjectParams = function (n, msg) {
        var params = {};

        service.getParams(n, msg, {
            guid: service.asIs,
            localFilename: service.asIs,
            ifMatch: service.defaultNullOrEmptyString,
            contentDisposition: service.defaultNullOrEmptyString,
            region: {
                rename: 'xAdsRegion'
            }
        }, params);

        if ((params.localFilename === null || params.localFilename === "") &&
            ((msg.topic === 'body' || msg.topic === 'content') &&
                (typeof msg.payload === 'string' || typeof msg.payload === 'object' || Buffer.isBuffer(msg.payload)))
        ) {
            if (typeof msg.payload === "object" && !Buffer.isBuffer(msg.payload))
                params.buffer = Buffer.from(JSON.stringify(msg.payload), 'utf8');
            else if (typeof msg.payload === "string")
                params.buffer = Buffer.from(msg.payload, 'utf8');
            else
                params.buffer = msg.payload;
        } else if ((params.localFilename === null || params.localFilename === "") &&
            msg.payload.content &&
            (typeof msg.payload.content === 'string' || typeof msg.payload.content === 'object' || Buffer.isBuffer(msg.payload.content))
        ) {
            if (typeof msg.payload.content === "object" && !Buffer.isBuffer(msg.payload.content))
                params.buffer = Buffer.from(JSON.stringify(msg.payload.content), 'utf8');
            else if (typeof msg.payload.content === "string")
                params.buffer = Buffer.from(msg.payload.content, 'utf8');
            else
                params.buffer = msg.payload.content;
        } else if ((params.localFilename === null || params.localFilename === "") && Buffer.isBuffer(msg.payload)) {
            params.buffer = msg.payload;
        }

        return (params);
    };

    service.PutSignedObject = function (n, node, oa2legged, msg, cb) {
        var params = service.PutSignedObjectParams(n, msg);

        service.PutSignedObject_put(oa2legged, params)
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        //cb(null, params);
    };

    service.PutSignedObject_full = function (oa2legged, options, size, rstream) {
        return (new Promise(function (fulfill, reject) {
            var ossObjects = new ForgeAPI.ObjectsApi();
            ossObjects.uploadSignedResource(options.guid, size, rstream, options, oa2legged, oa2legged.getCredentials())
                .then(function (result) {
                    fulfill(result);
                })
                .catch(function (error) {
                    reject(error);
                });
        }));
    };

    service.PutSignedObject_put = function (oa2legged, options) {
        return (new Promise(function (fulfillMaster, rejectMaster) {
            var ossObjects = new ForgeAPI.ObjectsApi();
            service.filesize(options.localFilename, options.buffer)
                .then(function (size) {
                    if (size <= 0)
                        throw new Error('Object size is empty!');
                    if (size <= service.chunkSize) {
                        var rstream = null;
                        if (options.localFilename !== "") {
                            rstream = fs.createReadStream(options.localFilename);
                        } else {
                            rstream = new streamBuffers.ReadableStreamBuffer({
                                frequency: 10, // in milliseconds.
                                chunkSize: 2048 // in bytes.
                            });
                            rstream.put(options.buffer);
                        }
                        return (service.PutSignedObject_full(oa2legged, options, size, rstream));
                    }
                    var nb = Math.floor(size / service.chunkSize);
                    if ((size % service.chunkSize) !== 0)
                        nb++;
                    var arr = [];
                    var uuid = uuidv4();
                    for (var i = 0; i < nb; i++) {
                        var start = i * service.chunkSize;
                        var end = start + service.chunkSize - 1;
                        if (end > size - 1)
                            end = size - 1;
                        var opts = {
                            ContentRange: 'bytes ' + start + '-' + end + '/' + size,
                            size: end - start + 1,
                            start: start,
                            end: end
                        };

                        // Still in parallel, but results processed in series with 'utils.promiseSerie'
                        //arr.push (ossObjects.uploadChunk (bucketKey, ossname, service.chunkSize, opts.ContentRange, sessionId, rstream, {}, oa2legged, oa2legged.getCredentials ())) ;

                        arr.push({
                            opts: opts,
                            options: options,
                            bucket: options.bucket,
                            key: options.key,
                            sessionId: uuid,
                            oa2legged: oa2legged
                        });
                    }

                    return (service.promiseSerie(arr, function (item, index) {
                        return (new Promise(function (fulfill, reject) {
                            // If still in parallel, but results processed in series with 'utils.promiseSerie', use item.then()

                            //console.log (JSON.stringify (item, null, 4)) ;
                            var rstream = null;
                            if (options.localFilename === "") {
                                fs.createReadStream(options.localFilename, {
                                    start: item.opts.start,
                                    end: item.opts.end
                                });
                            } else {
                                rstream = new streamBuffers.ReadableStreamBuffer({
                                    frequency: 10, // in milliseconds.
                                    chunkSize: 2048 // in bytes.
                                });
                                rstream.put(options.buffer.slice(item.opts.start, item.opts.end));
                            }
                            ossObjects.uploadSignedResourcesChunk(item.guid, item.opts.ContentRange, item.sessionId, rstream, item.options, item.oa2legged, item.oa2legged.getCredentials())
                                .then(function (content) {
                                    //console.log('Chunk ' + item.opts.ContentRange + ' accepted...');
                                    if (content.statusCode === 202)
                                        return (fulfill(item.opts.ContentRange));
                                    fulfill(content);
                                })
                                .catch(function (error) {
                                    reject(error);
                                });
                        }));
                    }));

                })
                .then(function (info) {
                    if (Array.isArray(info))
                        info = info.pop();
                    fulfillMaster(info);
                })
                .catch(function (error) {
                    rejectMaster(error);
                });
        }));
    };

    // GET	signedresources/:id
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/signedresources-:id-GET/
    service.GetSignedObjectParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            guid: service.asIs,
            range: service.defaultNullOrEmptyString,
            ifNoneMatch: service.defaultNullOrEmptyString,
            ifModifiedSince: service.defaultNullOrEmptyDate,
            acceptEncoding: service.defaultNullOrEmptyString,
            region: service.asIs
        }, params);

        return (params);
    };

    service.GetSignedObject = function (n, node, oa2legged, msg, cb) {
        var params = service.GetSignedObjectParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.getSignedResource(params.guid, params, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
    };

    // DELETE	signedresources/:id
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/signedresources-:id-DELETE/
    service.DeleteSignedObjectParams = function (n, msg) {
        var params = {};

        service.getParams(n, msg, {
            guid: service.asIs,
            region: service.asIs
        }, params);

        return (params);
    };

    service.DeleteSignedObject = function (n, node, oa2legged, msg, cb) {
        var params = service.DeleteSignedObjectParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.deleteSignedResource(params.guid, params, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
        // cb(null, params);
    };

    // PUT	buckets/:bucketKey/objects/:objectName/copyto/:newObjectName
    // https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-copyto-:newObjectName-PUT/
    service.CopyObjectParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey(n, params);
        service.copyArg(msg, "bucket", params, undefined, false);

        service.getParams(n, msg, {
            key: service.asIs,
            copySource: service.asIs
        }, params);

        return (params);
    };

    service.CopyObject = function (n, node, oa2legged, msg, cb) {
        var params = service.CopyObjectParams(n, msg);

        var ossObjects = new ForgeAPI.ObjectsApi();
        ossObjects.copyTo(params.bucket, params.copySource, params.key, oa2legged, oa2legged.getCredentials())
            .then(function (obj) {
                cb(null, obj);
            })
            .catch(function (error) {
                cb(error, null);
            });
    };

    // Utils
    service.asIs = {};
    service.defaultNullOrEmptyString = {
        type: "string",
        default: [null, ""]
    };
    service.defaultNullOrEmptyDate = {
        type: "date",
        default: [null, ""]
    };

    service.copyArg = function (src, arg, out, outArg, isObject) {
        outArg = (typeof outArg !== 'undefined') ? outArg : arg; // map property
        var tmpValue = src[arg];
        if (typeof tmpValue !== 'undefined') {
            if (isObject && typeof tmpValue === "string" && tmpValue !== "")
                tmpValue = JSON.parse(stmpValue);
            out[outArg] = tmpValue;
        } else if (src.payload && src.payload.hasOwnProperty(arg) && typeof src.payload[arg] !== 'undefined') {
            tmpValue = src.payload[arg];
            if (isObject && typeof tmpValue === "string" && tmpValue !== "")
                tmpValue = JSON.parse(stmpValue);
            out[outArg] = tmpValue;
        } else if (src.topic === arg) {
            tmpValue = src.payload;
            if (isObject && typeof tmpValue === "string" && tmpValue !== "")
                tmpValue = JSON.parse(stmpValue);
            out[outArg] = tmpValue;
        }
    };

    service.getParamsSimple = function (node, msg, keys, out) {
        var params = {};
        for (var i = 0; i < keys.length; i++) {
            service.copyArg(node, keys[i], params, undefined, false);
            service.copyArg(msg, keys[i], params, undefined, false);
        }
    };

    service.getParams = function (node, msg, params, out) {
        out = out || {};
        var keys = Object.keys(params);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            service.copyArg(node, key, out, undefined, false);
            service.copyArg(msg, key, out, undefined, false);

            if (params[key].type && params[key].type !== typeof out[key]) {
                switch (params[key].type) {
                    case 'number':
                        out[key] = parseFloat(out[key]);
                        break;
                    default:
                        break;
                }
            }

            if (params[key].default && params[key].default.includes(out[key])) {
                delete out[key];
                continue;
            }
            if (params[key].min && out[key] < params[key].min) {
                out[key] = params[key].min;
                continue;
            }
            if (params[key].max && out[key] > params[key].max) {
                out[key] = params[key].max;
                continue;
            }

            if (params[key].type && params[key].type === 'date') {
                var dt = Date.parse(out[key]);
                out[key] = new Date(dt).toUTCString();
            }

            if (params[key].rename) { // Should be last
                out[params[key].rename] = out[key];
                delete out[key];
                continue;
            }
        }
    };

    service.filesize = function (filename, payload) {
        return (new Promise(function (fulfill, reject) {
            if (filename === "" && Buffer.isBuffer(payload))
                return (fulfill(payload.length));

            fs.stat(filename, function (err, stat) {
                if (err)
                    reject(err);
                else
                    fulfill(stat.size);
            });
        }));
    };

    // https://github.com/joliss/promise-map-series
    service.promiseSerie = function (array, iterator, thisArg) {
        var length = array.length;
        var current = Promise.resolve();
        var results = new Array(length);
        var cb = arguments.length > 2 ? iterator.bind(thisArg) : iterator;
        for (var i = 0; i < length; i++) {
            current = results[i] = current.then(function (i) { // jshint ignore:line
                return (cb(array[i], i, array));
            }.bind(undefined, i));
        }
        return (Promise.all(results));
    };

};