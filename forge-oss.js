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
                node.error(RED._("forge.error.unknown-operation", { op: node.ossProperties.operation }));
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
                src.bucketType ="env";
                src.bucket ="FORGE_BUCKET";
            }
            out.bucket =RED.util.evaluateNodeProperty(src.bucket, src.bucketType, src, out);
        } catch (err) {
            out.bucket =src.bucket;
        }
    };

    service.ListBucketsParams = function (n, msg) {
        var params = {};
        service.copyArg(n, "limit", params, undefined, false);
        service.copyArg(n, "startAt", params, undefined, false);
        service.copyArg(n, "region", params, undefined, false);

        service.copyArg(msg, "limit", params, undefined, false);
        service.copyArg(msg, "startAt", params, undefined, false);
        service.copyArg(msg, "region", params, undefined, false);

        if (params.startAt === null || params.startAt === "")
            delete params.startAt;
        if (params.limit === 10)
            delete params.limit;
        if (params.limit > 100)
            params.limit = 100;
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

    service.BucketDetailsParams = function (n, msg) {
        var params = {};
        //service.copyArg(n, "bucket", params, undefined, false);
        service.BucketKey (n, params);
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

    service.copyArg = function (src, arg, out, outArg, isObject) {
        outArg = (typeof outArg !== 'undefined') ? outArg : arg; // map property
        var tmpValue = src[arg];
        if (typeof tmpValue !== 'undefined') {
            if (isObject && typeof tmpValue === "string" && tmpValue !== "")
                tmpValue = JSON.parse(stmpValue);
            out[outArg] = tmpValue;
        } else if (src.payload.hasOwnProperty(arg) && typeof src.payload[arg] !== 'undefined') {
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

};