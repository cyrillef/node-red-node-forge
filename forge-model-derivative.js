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
	var ForgeAPI = require('forge-apis');
	var utils = require('./utils');

	// Forge
	function ForgeModelDerivativeNode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.mdProperties = n;
		var node = this;

		function onInput(msg) {

			var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
			if (!FORGE) {
				node.warn(RED._('forge.warn.missing-credentials'));
				return;
			}

			node.sendMsg = function (err, data) {
				if (err) {
					node.status({
						fill: 'red',
						shape: 'ring',
						text: 'error'
					});
					//node.error('failed: ' + err.toString(), msg);
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
			region: service.asIs
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
				// rootFilename: params.rootFilename
			},
			output: {
				destination: {
					region: params.region
				},
				formats: node.mdProperties.jobs
			}
        };
        if (params.hasOwnProperty('rootFilename')) {
            jobs.input.compressedUrn =params.compressedUrn;
            jobs.input.rootFilename = params.rootFilename;
        }

    	var apis = new ForgeAPI.DerivativesApi();
		apis.translate(jobs, params, oa2legged, oa2legged.getCredentials())
			.then(function (response) {
				//console.log(JSON.stringify(response.body, null, 4));
				cb(null, response);
			})
			.catch(function (error) {
				cb(error, null);
			});
	};

	// GET	:urn/manifest
	// https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-GET/
	service.GetManifestParams = function (n, msg) {
		var params = {};

		//service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
		service.getParams(n, msg, {
			urn: service.asIs,
			acceptEncoding: service.defaultNullOrEmptyString
		}, params);

		return (params);
	};

	service.GetManifest = function (n, node, oa2legged, msg, cb) {
		var params = service.GetManifestParams(n, msg);

		var apis = new ForgeAPI.DerivativesApi();
		apis.getManifest(params.urn, params, oa2legged, oa2legged.getCredentials())
			.then(function (response) {
				//console.log(JSON.stringify(response.body, null, 4));
				cb(null, response);
			})
			.catch(function (error) {
				cb(error, null);
			});
	};

	// DELETE	:urn/manifest
	// https://forge.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-DELETE/
	service.DeleteManifestParams = function (n, msg) {
		var params = {};

		//service.getParamsSimple(n, msg, ['limit', 'startAt', 'region'], params);
		service.getParams(n, msg, {
			urn: service.asIs
		}, params);

		return (params);
	};

	service.DeleteManifest = function (n, node, oa2legged, msg, cb) {
		var params = service.DeleteManifestParams(n, msg);

		var apis = new ForgeAPI.DerivativesApi();
		apis.deleteManifest(params.urn, oa2legged, oa2legged.getCredentials())
			.then(function (response) {
				//console.log(JSON.stringify(response.body, null, 4));
				cb(null, response);
			})
			.catch(function (error) {
				cb(error, null);
			});
	};

};