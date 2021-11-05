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
	function ForgeCommandsNode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.commandsProperties = n;
		var node = this;

		async function onInput(msg) {
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
					msgErr.err.op = 'commands:' + node.commandsProperties.operation;
					node.send([null, msgErr]);
					return;
				}

				msg.payload = data;
				node.status({});
				msg.topic = node.commandsProperties.topic || node.topic;
				msg.op ='commands:' + node.commandsProperties.operation;
				node.send([msg, null]);
			};

			var _cb = function (err, data) {
				node.sendMsg(err, data);
			};

			if (typeof service[node.commandsProperties.operation] === 'function') {
				node.status({
					fill: 'blue',
					shape: 'dot',
					text: node.commandsProperties.operation
				});
				service[node.commandsProperties.operation](n, node, await FORGE, msg, _cb);
			} else {
				node.error(RED._('forge.error.unknown-operation', {
					op: node.commandsProperties.operation
				}));
			}
		}

		node.on('input', onInput);
	}

	RED.nodes.registerType('forge-commands', ForgeCommandsNode);

	var service = {};
	utils(service);

	// #region --- Commands ---

	// POST /projects/:project_id/commands - CheckPermission
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/CheckPermission/
	service.CheckPermissionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CheckPermission = function (n, node, oa3legged, msg, cb) {
		var params = service.CheckPermissionParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.checkPermission(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/commands - ListRefs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/ListRefs/
	service.ListRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.ListRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.ListRefsParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.listRefs(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/commands - ListItems
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/ListItems/
	service.ListItemsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.ListItems = function (n, node, oa3legged, msg, cb) {
		var params = service.ListItemsParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.listItems(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/commands - CreateFolder
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/CreateFolder/
	service.CreateFolderParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateFolder = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateFolderParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.createFolder(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/commands - PublishModel
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/PublishModel/
	service.PublishModelParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.PublishModel = function (n, node, oa3legged, msg, cb) {
		var params = service.PublishModelParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.publishModel(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/commands - GetPublishModelJob
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/GetPublishModelJob/
	service.GetPublishModelJobParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}


		return (params);
	};

	service.GetPublishModelJob = function (n, node, oa3legged, msg, cb) {
		var params = service.GetPublishModelJobParams(n, msg);

		var api = new ForgeAPI.CommandsApi();
		api.getPublishModelJob(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

};