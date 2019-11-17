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
	const url = require('url');
	const fs = require('fs');
	const uuidv4 = require('uuid/v4');
	const streamBuffers = require('stream-buffers');
	const utils = require('./utils');
	const ForgeAPI = require('forge-apis');

	// Forge
	function ForgeOSSNode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.ossProperties = n;
		var node = this;

		function onInput(msg) {
			//msg.topic = node.topic;
			//var _msg = RED.util.cloneMessage(msg);

			// Access the node's context object
			// var nodeContext = node.context();
			// var flowContext = node.context().flow;
			// var globalContext = node.context().global;

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
				RED.nodes.eachNode((elt) => {
					// elt.type === 'forge-*'
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
					msgErr.err.op = 'oss:' + node.ossProperties.operation;
					node.send([null, msgErr]);
					return;
				}

				msg.payload = data;
				node.status({});
				msg.topic = node.ossProperties.topic || node.topic;
				msg.op ='oss:' + node.ossProperties.operation;
				node.send([msg, null]);
			};

			var _cb = function (err, data) {
				node.sendMsg(err, data);
			};

			if (typeof service[node.ossProperties.operation] === 'function') {
				node.status({
					fill: 'blue',
					shape: 'dot',
					text: node.ossProperties.operation
				});
				service[node.ossProperties.operation](n, node, FORGE, msg, _cb);
			} else {
				node.error(RED._('forge.error.unknown-operation', {
					op: node.ossProperties.operation
				}));
			}
		}

		node.on('input', onInput);
	}

	RED.nodes.registerType('forge-oss', ForgeOSSNode);

	var service = {};
	utils(service);

	// #region --- Bucket ---

	service.BucketKey = function (src, out) {
		try {
			if ((src.bucketType === null && src.bucket === '') || src.bucketType === 'none') {
				src.bucketType = 'env';
				src.bucket = 'FORGE_BUCKET';
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

		//service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
		service.getParams(n, msg, {
			limit: {
				type: 'number',
				default: [10],
				min: 0,
				max: 100
			},
			startAt: service.defaultNullOrEmptyString,
			region: {
				default: ['US']
			},
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);
		return (params);
	};

	service.ListBuckets = function (n, node, oa2legged, msg, cb) {
		var params = service.ListBucketsParams(n, msg);

		var ossBuckets = new ForgeAPI.BucketsApi();
		service.pagination(ossBuckets, ossBuckets.getBuckets, params, [ params, oa2legged, oa2legged.getCredentials() ])
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	buckets/:bucketKey/details
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-details-GET/
	service.BucketDetailsParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.BucketDetails = function (n, node, oa2legged, msg, cb) {
		var params = service.BucketDetailsParams(n, msg);

		var ossBuckets = new ForgeAPI.BucketsApi();
		ossBuckets.getBucketDetails(params.bucket, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST	buckets
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-details-GET/
	service.CreateBucketParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			policyKey: service.asIs,
			region: {
				rename: 'xAdsRegion'
			},
			raw: service.defaultNullOrEmptyBoolean
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
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// DELETE	buckets/:bucketKey
	// undocumented
	service.DeleteBucketParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.DeleteBucket = function (n, node, oa2legged, msg, cb) {
		var params = service.DeleteBucketParams(n, msg);

		var ossBuckets = new ForgeAPI.BucketsApi();
		ossBuckets.deleteBucket(params.bucket, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Objects --- 

	// GET	buckets/:bucketKey/objects
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-GET/
	service.ListObjectsParams = function (n, msg) {
		var params = {};

		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		//service.getParamsSimple(n, msg, ['limit', 'startAt', 'beginsWidth'], params);
		service.getParams(n, msg, {
			limit: {
				type: 'number',
				default: [10],
				min: 0,
				max: 100
			},
			startAt: service.defaultNullOrEmptyString,
			beginsWith: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);
		return (params);
	};

	service.ListObjects = function (n, node, oa2legged, msg, cb) {
		var params = service.ListObjectsParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		service.pagination(ossObjects, ossObjects.getObjects, params, [ params.bucket, params, oa2legged, oa2legged.getCredentials() ])
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	buckets/:bucketKey/objects/:objectName/details
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-details-GET/
	service.ObjectDetailsParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			with: {
				type: 'string',
				default: [null, ''],
				rename: '_with'
			},
			ifModifiedSince: service.defaultNullOrEmptyDate,
			raw: service.defaultNullOrEmptyBoolean
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
			.then(function (results) {
				results.body.urn = service.safeBase64encode(results.body.objectId);
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	buckets/:bucketKey/objects/:objectName
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-GET/
	service.GetObjectParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			range: service.defaultNullOrEmptyString,
			ifNoneMatch: service.defaultNullOrEmptyString,
			ifModifiedSince: service.defaultNullOrEmptyDate,
			acceptEncoding: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetObject = function (n, node, oa2legged, msg, cb) {
		var params = service.GetObjectParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.getObject(params.bucket, params.key, params, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
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
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			localFilename: service.asIs,
			ifMatch: service.defaultNullOrEmptyString,
			contentType: service.defaultNullOrEmptyString,
			contentDisposition: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		if ((params.localFilename === null || params.localFilename === '') &&
			((msg.topic === 'body' || msg.topic === 'content') &&
				(typeof msg.payload === 'string' || typeof msg.payload === 'object' || Buffer.isBuffer(msg.payload)))
		) {
			if (typeof msg.payload === 'object' && !Buffer.isBuffer(msg.payload))
				params.buffer = Buffer.from(JSON.stringify(msg.payload), 'utf8');
			else if (typeof msg.payload === 'string')
				params.buffer = Buffer.from(msg.payload, 'utf8');
			else
				params.buffer = msg.payload;
		} else if ((params.localFilename === null || params.localFilename === '') &&
			msg.payload.content &&
			(typeof msg.payload.content === 'string' || typeof msg.payload.content === 'object' || Buffer.isBuffer(msg.payload.content))
		) {
			if (typeof msg.payload.content === 'object' && !Buffer.isBuffer(msg.payload.content))
				params.buffer = Buffer.from(JSON.stringify(msg.payload.content), 'utf8');
			else if (typeof msg.payload.content === 'string')
				params.buffer = Buffer.from(msg.payload.content, 'utf8');
			else
				params.buffer = msg.payload.content;
		} else if ((params.localFilename === null || params.localFilename === '') && Buffer.isBuffer(msg.payload)) {
			params.buffer = msg.payload;
		}

		return (params);
	};

	service.PutObject = function (n, node, oa2legged, msg, cb) {
		var params = service.PutObjectParams(n, msg);

		service.PutObject_put(oa2legged, params)
			.then(function (results) {
				results.body.urn = service.safeBase64encode(results.body.objectId);
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
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
						if (options.localFilename !== '') {
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
							if (options.localFilename !== '') {
								rstream = fs.createReadStream(options.localFilename, {
									start: item.opts.start,
									end: item.opts.end
								});
							} else {
								rstream = new streamBuffers.ReadableStreamBuffer({
									initialSize: item.opts.size,
									frequency: streamBuffers.DEFAULT_FREQUENCY, // in milliseconds.
									chunkSize: 8 * streamBuffers.DEFAULT_CHUNK_SIZE // in bytes.
								});
								rstream.put(options.buffer.slice(item.opts.start, item.opts.end + 1));
								rstream.stop();
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
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.DeleteObject = function (n, node, oa2legged, msg, cb) {
		var params = service.DeleteObjectParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.deleteObject(params.bucket, params.key, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST	buckets/:bucketKey/objects/:objectName/signed
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-signed-POST/
	service.CreateSignatureParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			access: service.asIs,
			singleUse: service.asIs,
			minutesExpiration: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params.minutesExpiration = parseInt(params.minutesExpiration);

		return (params);
	};

	service.CreateSignature = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateSignatureParams(n, msg);

		var postBucketsSigned = {
			singleUse: params.singleUse,
			minutesExpiration: params.minutesExpiration,
			access: params.access
		};

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.createSignedResource(params.bucket, params.key, postBucketsSigned, params, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				var url_parts = url.parse(results.body.signedUrl, true);
				results.body.guid = url_parts.pathname.split('/').pop();
				results.body.region = url_parts.query.region || 'US';
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
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
			},
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		if ((params.localFilename === null || params.localFilename === '') &&
			((msg.topic === 'body' || msg.topic === 'content') &&
				(typeof msg.payload === 'string' || typeof msg.payload === 'object' || Buffer.isBuffer(msg.payload)))
		) {
			if (typeof msg.payload === 'object' && !Buffer.isBuffer(msg.payload))
				params.buffer = Buffer.from(JSON.stringify(msg.payload), 'utf8');
			else if (typeof msg.payload === 'string')
				params.buffer = Buffer.from(msg.payload, 'utf8');
			else
				params.buffer = msg.payload;
		} else if ((params.localFilename === null || params.localFilename === '') &&
			msg.payload.content &&
			(typeof msg.payload.content === 'string' || typeof msg.payload.content === 'object' || Buffer.isBuffer(msg.payload.content))
		) {
			if (typeof msg.payload.content === 'object' && !Buffer.isBuffer(msg.payload.content))
				params.buffer = Buffer.from(JSON.stringify(msg.payload.content), 'utf8');
			else if (typeof msg.payload.content === 'string')
				params.buffer = Buffer.from(msg.payload.content, 'utf8');
			else
				params.buffer = msg.payload.content;
		} else if ((params.localFilename === null || params.localFilename === '') && Buffer.isBuffer(msg.payload)) {
			params.buffer = msg.payload;
		}

		return (params);
	};

	service.PutSignedObject = function (n, node, oa2legged, msg, cb) {
		var params = service.PutSignedObjectParams(n, msg);

		service.PutSignedObject_put(oa2legged, params)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
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
						if (options.localFilename !== '') {
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
							if (options.localFilename !== '') {
								rstream = fs.createReadStream(options.localFilename, {
									start: item.opts.start,
									end: item.opts.end
								});
							} else {
								rstream = new streamBuffers.ReadableStreamBuffer({
									frequency: 10, // in milliseconds.
									chunkSize: 2048 // in bytes.
								});
								rstream.put(options.buffer.slice(item.opts.start, item.opts.end + 1));
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
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			guid: service.asIs,
			range: service.defaultNullOrEmptyString,
			ifNoneMatch: service.defaultNullOrEmptyString,
			ifModifiedSince: service.defaultNullOrEmptyDate,
			acceptEncoding: service.defaultNullOrEmptyString,
			region: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetSignedObject = function (n, node, oa2legged, msg, cb) {
		var params = service.GetSignedObjectParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.getSignedResource(params.guid, params, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// DELETE	signedresources/:id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/signedresources-:id-DELETE/
	service.DeleteSignedObjectParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			guid: service.asIs,
			region: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.DeleteSignedObject = function (n, node, oa2legged, msg, cb) {
		var params = service.DeleteSignedObjectParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.deleteSignedResource(params.guid, params, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// PUT	buckets/:bucketKey/objects/:objectName/copyto/:newObjectName
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/buckets-:bucketKey-objects-:objectName-copyto-:newObjectName-PUT/
	service.CopyObjectParams = function (n, msg) {
		var params = {};
		//service.copyArg(n, 'bucket', params, undefined, false);
		service.BucketKey(n, params);
		service.copyArg(msg, 'bucket', params, undefined, false);

		service.getParams(n, msg, {
			key: service.asIs,
			copy: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CopyObject = function (n, node, oa2legged, msg, cb) {
		var params = service.CopyObjectParams(n, msg);

		var ossObjects = new ForgeAPI.ObjectsApi();
		ossObjects.copyTo(params.bucket, params.key, params.copy, oa2legged, oa2legged.getCredentials())
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Utils for OSS ---

	service.pagination = function (api, method, params, args) {
		var that = this;
		return (new Promise(function (fulfill, reject) {
			method.apply(api, args)
				.then(function (results) {
					if (params.all && results.body.next) {
						var url_parts = url.parse(results.body.next, true);
						// results.body.nextKey = url_parts.query.startAt;
						// results.body.limit = url_parts.query.limit;
						// results.body.region = params.region;
						params.startAt = url_parts.query.startAt;
						service.pagination (api, method, params, args)
							.then(function (results2) {
								results.body.items = [ ...results.body.items, ...results2.body.items] ;
								delete results.body.next;
								fulfill(results);
							})
							.catch(function (error) {
								reject(error);
							});
						return;
					}
					fulfill(results);
				})
				.catch(function (error) {
					reject(error);
				});
		}));
	};

	// #endregion

};