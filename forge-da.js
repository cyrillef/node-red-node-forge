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
	'use strict';
	var http = require('https');
	const utils = require('./utils');
	const dav3 = require('autodesk.forge.designautomation');

	// const {
	//   DesignAutomationClient,
	//   DesignAutomationID,
	//   DataManagementClient
	// } = require('forge-server-utils');

	// Forge
	function ForgeDANode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.daProperties = n;
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
				RED.nodes.eachNode(elt => {
					// elt.type === 'forge-*'
					// https://discourse.nodered.org/t/how-to-get-flow-id-by-function-node/9889
					if (
						node._forgeCredentials &&
						elt.type === 'forge-default-credentials'
					) {
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
					node.forgeCredentials = RED.nodes.getNode(
						forgeDefaultCredentials
					).forgeCredentials;
					onInput(msg);
					forgeDefaultCredentials = null;
				}
				if (node._forgeCredentials) delete node._forgeCredentials;
				return;
			}

			node.sendMsg = function (err, data) {
				if (err) {
					var text = 'error';
					if (err.statusCode)
						text = `${err.statusCode}: ${err.statusMessage || err.message}`;
					else if (err.message)
						text = err.message;

					node.status({
						fill: 'red',
						shape: 'ring',
						text: text
					});
					//node.error('failed: ' + err.toString(), msg);
					var msgErr = {
						err: err,
						statusCode: err.statusCode,
						op: 'da:' + node.daProperties.operation,
						details: err.details,
						headers: err.headers,
					};
					var keys = Object.keys(msg);
					for (var i = 0; i < keys.length; i++) {
						var key = keys[i];
						if (['payload', '_msgid', '__proto__'].includes(key) || msgErr.hasOwnProperty(key))
							continue;
						msgErr[key] = msg[key];
					}
					node.send([null, msgErr]);
					return;
				}

				msg.payload = data;
				node.status({});
				msg.topic = node.daProperties.topic || node.topic;
				msg.op ='da:' + node.daProperties.operation;
				node.send([msg, null]);
			};

			var _cb = function (err, data) {
				node.sendMsg(err, data);
			};

			if (typeof service[node.daProperties.operation] === 'function') {
				node.status({
					fill: 'blue',
					shape: 'dot',
					text: node.daProperties.operation
				});
				service[node.daProperties.operation](n, node, await FORGE, msg, _cb);
			} else {
				node.error(
					RED._('forge.error.unknown-operation', {
						op: node.daProperties.operation
					})
				);
			}
		}

		node.on('input', onInput);
	}

	RED.nodes.registerType('forge-da', ForgeDANode);

	var service = {};
	utils(service);

	// #region --- Activities ---

	// GET	activities
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-GET/
	service.ListActivitiesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);
		
		return (params);
	};

	service.ListActivities = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivitiesParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivitiesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST	activities
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-POST/
	service.CreateActivityParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
			engine: service.asIs,
			description: service.defaultNullOrEmptyString,
			commandline: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			parameters: service.asIs,
			settings: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateActivity = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var body ={
			id: params.activityId,
			engine: params.engine,
			description: params.description,
			appbundles: service.splitStringArray(params.appbundles),
			commandLine: service.splitStringArray(params.commandline),
			// settings: params.settings ? params.settings : null,
			// parameters: params.parameters ? params.parameters : null
		};
		if (params.settings && params.settings.length) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}
		if (params.parameters && params.parameters.length) {
			body.parameters ={};
			params.parameters.map(function (elt) {
				body.parameters[elt.id] =JSON.parse(JSON.stringify(elt));
				delete body.parameters[elt.id].id;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityWithHttpInfo(body)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	activities/:id/aliases/:aliasId
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-aliases-aliasId-GET/
	service.GetActivityAliasParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			activityId: service.asIs,
			alias: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityAliasWithHttpInfo(params.activityId, params.alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE	activities/:id/aliases/:aliasId
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-aliases-aliasId-DELETE/
	service.DeleteActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteActivityAliasWithHttpInfo(params.activityId, params.alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// PATCH	activities/:id/aliases/:aliasId
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-aliases-aliasId-PATCH/
	service.UpdateActivityAliasParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
			alias: service.asIs,
			version: service.defaultNullOrEmptyString,
			receiver: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.UpdateActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.UpdateActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var aliasSpec = {
			version: params.version,
			receiver: params.receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.modifyActivityAliasWithHttpInfo(params.activityId, params.alias, aliasSpec)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	activities/:id/aliases
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-aliases-GET/
	service.ListActivityAliasesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
            page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListActivityAliases = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivityAliasesParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivityAliasesWithHttpInfo, params, [ params.activityId ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST	activities/:id/aliases
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-aliases-POST/
	service.CreateActivityAliasParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
			alias: service.asIs,
			version: service.asIs,
			receiver: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var alias = {
			id: params.alias,
			version: params.version,
			receiver: params.receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityAliasWithHttpInfo(params.activityId, alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	activities/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-GET/
	service.GetActivityParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetActivity = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityParams(n, msg);
		//params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityWithHttpInfo(params.activityId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE	activities/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-DELETE/
	service.DeleteActivity = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteActivityWithHttpInfo(params.activityId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	activities/:id/versions
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-versions-GET/
	service.ListActivityVersionsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			activityId: service.asIs,
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListActivityVersions = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivityVersionsParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivityVersionsWithHttpInfo, params, [ params.activityId, params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST	activities/:id/versions
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-versions-POST/
	service.CreateActivityVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			activityId: service.asIs,
			engine: service.asIs,
			description: service.defaultNullOrEmptyString,
			commandline: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			parameters: service.asIs,
			settings: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateActivityVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityVersionParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var body ={
			//id: params.activityId,
			engine: params.engine,
			description: params.description,
			appbundles: service.splitStringArray(params.appbundles),
			commandLine: service.splitStringArray(params.commandline),
			// settings: params.settings ? params.settings : null,
			// parameters: params.parameters ? params.parameters : null,
			//version: params.version
		};
		if (params.settings && params.settings.length) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}
		if (params.parameters && params.parameters.length) {
			body.parameters ={};
			params.parameters.map(function (elt) {
				body.parameters[elt.id] =JSON.parse(JSON.stringify(elt));
				delete body.parameters[elt.id].id;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityVersionWithHttpInfo(params.activityId, body)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	activities/:id/versions/:version
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-versions-version-GET/
	service.GetActivityVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			activityId: service.asIs,
			version: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetActivityVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityVersionParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityVersionWithHttpInfo(params.activityId, params.version)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});	
	};
  
	// DELETE	activities/:id/versions/:version
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-versions-version-DELETE/
	service.DeleteActivityVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityVersionParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteActivityVersionWithHttpInfo(params.activityId, params.version)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});	
	};
  
	// #endregion

	// #region --- AppBundles ---

	// GET appbundles
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-GET/
	service.ListAppbundlesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListAppbundles = function (n, node, oa2legged, msg, cb) {
		var params = service.ListAppbundlesParams(n, msg);
		
		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getAppBundlesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST appbundles
	service.CreateAppbundlesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			engine: service.asIs,
			description: service.defaultNullOrEmptyString,
			commandline: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			settings: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateAppbundles = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateAppbundlesParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var body ={
			id: params.appbundlesId,
			engine: params.engine,
			description: params.description,
			appbundles: service.splitStringArray(params.appbundles),
			commandLine: service.splitStringArray(params.commandline),
			// settings: params.settings ? params.settings : null,
		};
		if (params.settings && params.settings.length) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createAppBundleWithHttpInfo(body)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};
	
	// GET appbundles/:id/aliases/:aliasId
	service.GetAppbundlesAliasParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			alias: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetAppbundlesAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesAliasParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getAppBundleAliasWithHttpInfo(params.appbundlesId, params.alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE appbundles/:id/aliases/:aliasId
	service.DeleteAppbundlesAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesAliasParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteAppBundleAliasWithHttpInfo(params.appbundlesId, params.appbundlesAliasId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// PATCH appbundles/:id/aliases/:aliasId
	service.UpdateAppbundlesAliasParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			alias: service.asIs,
			version: service.defaultNullOrEmptyString,
			receiver: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.UpdateAppbundlesAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.UpdateAppbundlesAliasParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var alias = {
			version: params.version,
			receiver: params.receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.modifyAppBundleAliasWithHttpInfo(params.appbundlesId, params.alias, alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET appbundles/:id/aliases
	service.ListAppbundlesAliasesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
            page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListAppbundlesAliases = function (n, node, oa2legged, msg, cb) {
		var params = service.ListAppbundlesAliasesParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getAppBundleAliasesWithHttpInfo, params, [ params.appbundlesId ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST appbundles/:id/aliases
	service.CreateAppbundlesAliasParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			alias: service.asIs,
			version: service.asIs,
			receiver: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateAppbundlesAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateAppbundlesAliasParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var alias = {
			id: params.alias,
			version: params.version,
			receiver: params.receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.createAppBundleAliasWithHttpInfo(params.appbundlesId, alias)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET appbundles/:id
	service.GetAppbundlesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetAppbundles = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesParams(n, msg);
		//params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getAppBundleWithHttpInfo(params.appbundlesId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE appbundles/:id
	service.DeleteAppbundles = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteAppBundleWithHttpInfo(params.appbundlesId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET appbundles/:id/versions
	service.ListAppbundlesVersionsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListAppbundlesVersions = function (n, node, oa2legged, msg, cb) {
		var params = service.ListAppbundlesVersionsParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getAppBundleVersionsWithHttpInfo, params, [ params.appbundlesId, params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST appbundles/:id/versions
	service.CreateAppbundlesVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			package: service.defaultNullOrEmptyString,
			engine: service.asIs,
			description: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			settings: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.CreateAppbundlesVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateAppbundlesVersionParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var body ={
			//id: params.appbundlesId,
			package: params.package,
			engine: params.engine,
			description: params.description,
			appbundles: service.splitStringArray(params.appbundles),
			// settings: params.settings ? params.settings : null,
			//version: params.version
		};
		if (params.settings && params.settings.length) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createAppBundleVersionWithHttpInfo(params.appbundlesId, body)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET appbundles/:id/versions/:version
	service.GetAppbundlesVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			appbundlesId: service.asIs,
			version: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetAppbundlesVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesVersionParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getAppBundleVersionWithHttpInfo(params.appbundlesId, params.version)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});	
	};

	// DELETE appbundles/:id/versions/:version
	service.DeleteAppbundlesVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.GetAppbundlesVersionParams(n, msg);
		params.appbundlesId = service.getUnqualifiedId(params.appbundlesId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteAppBundleVersionWithHttpInfo(params.appbundlesId, params.version)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});	
	};

	// #endregion

	// #region --- Engines ---

	// GET	engines
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-GET/
	service.ListEnginesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListEngines = function (n, node, oa2legged, msg, cb) {
		var params = service.ListEnginesParams(n, msg);
		
		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getEnginesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	engines/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-id-GET/
	service.GetEngineParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			engine: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetEngine = function (n, node, oa2legged, msg, cb) {
		var params = service.GetEngineParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getEngineWithHttpInfo(params.engine)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- ForgeApps ---

	// GET forgeapps/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/forgeapps-id-GET/
	service.GetForgeAppsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			nickname: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		if (!params.nickname)
			params.nickname = 'me';

		return (params);
	};

	service.GetForgeApps = function (n, node, oa2legged, msg, cb) {
		var params = service.GetForgeAppsParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getNicknameWithHttpInfo(params.nickname)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE forgeapps/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/forgeapps-id-DELETE/
	service.DeleteForgeApps = function (n, node, oa2legged, msg, cb) {
		var params = service.GetForgeAppsParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteForgeAppWithHttpInfo(params.nickname)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// PATCH forgeapps/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/forgeapps-id-PATCH/
	service.UpdateForgeAppsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			nickname: service.asIs,
			exponent: service.defaultNullOrEmptyString,
			modulus: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);
		
		if (!params.nickname)
			params.nickname = 'me';

		return (params);
	};

	service.UpdateForgeApps = function (n, node, oa2legged, msg, cb) {
		var params = service.UpdateForgeAppsParams(n, msg);

		var nicknameRecord = {
			nickname: params.nickname,
			publicKey: {
				Exponent: params.exponent,
				Modulus: params.modulus
			}
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.createNicknameWithHttpInfo(params.nickname, nicknameRecord)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- Health ---

	// GET	health/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-id-GET/
	service.GetHealthParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			engine: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetHealth = function (n, node, oa2legged, msg, cb) {
		var params = service.GetHealthParams(n, msg);

		var api = service.dav3API();
		api.healthStatusWithHttpInfo(params.engine)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- ServiceLimits ---

	// GET servicelimits/:owner
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/servicelimits-owner-GET/
	service.GetServiceLimitsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			nickname: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetServiceLimits = function (n, node, oa2legged, msg, cb) {
		var params = service.GetServiceLimitsParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getServiceLimitWithHttpInfo(params.nickname)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// PUT servicelimits/:owner
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/servicelimits-owner-PUT/
	service.SetServiceLimitsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			nickname: service.asIs,
			item: service.asIs,
			// frontendLimits
		//	limitPayloadSizeInKB: service.defaultNullOrEmptyString,
		//	limitVersions: service.defaultNullOrEmptyString,
		//	limitAliases: service.defaultNullOrEmptyString,
		//	limitPublicAliases: service.defaultNullOrEmptyString,
		//	limitAppUploadSizeInMB: service.defaultNullOrEmptyString,
			limitMonthlyProcessingTimeInHours: service.defaultNullOrEmptyString,
			// backendLimits
			backendLimits: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.SetServiceLimits = function (n, node, oa2legged, msg, cb) {
		var params = service.SetServiceLimitsParams(n, msg);

		var item = {
			frontendLimits: {
			//	limitPayloadSizeInKB: params.limitPayloadSizeInKB,
			//	limitVersions: params.limitVersions,
			//	limitAliases: params.limitAliases,
			//	limitPublicAliases: params.limitPublicAliases,
			//	limitAppUploadSizeInMB: params.limitAppUploadSizeInMB,
				limitMonthlyProcessingTimeInHours: params.limitMonthlyProcessingTimeInHours,
			},
			//backendLimits: null
		};

		if (params.backendLimits && params.backendLimits.length) {
			item.backendLimits ={};
			params.backendLimits.map(function (elt) {
				item.backendLimits[elt.id] =JSON.parse(JSON.stringify(elt));
				delete item.backendLimits[elt.id].id;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.modifyServiceLimitsWithHttpInfo(params.nickname, item)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE servicelimits/:owner
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/servicelimits-owner-DELETE/
	service.DeleteServiceLimits = function (n, node, oa2legged, msg, cb) {
		var params = service.GetServiceLimitsParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteServiceLimitsWithHttpInfo(params.nickname)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- Shares ---

	// GET shares
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/shares-GET/
	service.ListSharesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);
		
		return (params);
	};

	service.ListShares = function (n, node, oa2legged, msg, cb) {
		var params = service.ListSharesParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getSharesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- WorkItems ---

	// GET workitems/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-id-GET/
	service.GetWorkitemsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			workitemId: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetWorkitems = function (n, node, oa2legged, msg, cb) {
		var params = service.GetWorkitemsParams(n, msg);
		
		var api = service.dav3API(oa2legged.getCredentials());
		api.getWorkitemStatusWithHttpInfo(params.workitemId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// DELETE workitems/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-id-DELETE/
	service.DeleteWorkitems = function (n, node, oa2legged, msg, cb) {
		var params = service.GetWorkitemsParams(n, msg);
		
		var api = service.dav3API(oa2legged.getCredentials());
		api.deleteWorkitemWithHttpInfo(params.workitemId)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST workitems
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-POST/
	service.CreateWorkitemsParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			//workitemId: service.asIs,
			activityId: service.asIs,
			limitProcessingTimeSec: service.defaultNullOrEmptyString,
			arguments: service.asIs,
			baseUrls: service.defaultNullOrEmptyString,
			signature: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		if (params.limitProcessingTimeSec)
			params.limitProcessingTimeSec =parseInt(params.limitProcessingTimeSec);

		return (params);
	};
	
	service.CreateWorkitems = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateWorkitemsParams(n, msg);
		
		var workitem ={
			activityId: params.activityId,
			limitProcessingTimeSec: params.limitProcessingTimeSec
		};
		if (params.arguments && params.arguments.length) {
			workitem.arguments ={};
			params.arguments.map(function (elt) {
				workitem.arguments[elt.key] =JSON.parse(JSON.stringify(elt));
				delete workitem.arguments[elt.key].key;
			});
		}
		if (params.baseUrls && params.signature) {
			workitem.signatures = {
				activityId: params.activityId,
				baseUrls: {
					url: params.baseUrls,
					signature: params.signature
				}
			};
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createWorkItemWithHttpInfo(workitem)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// POST workitems/batch
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-batch-POST/
	service.CreateBatchWorkitems = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateWorkitemsParams(n, msg);
		
		var workitem ={
			activityId: params.activityId,
			limitProcessingTimeSec: params.limitProcessingTimeSec
		};
		if (params.arguments && params.arguments.length) {
			workitem.arguments ={};
			params.arguments.map(function (elt) {
				workitem.arguments[elt.key] =JSON.parse(JSON.stringify(elt));
				delete workitem.arguments[elt.key].key;
			});
		}
		if (params.baseUrls && params.signature) {
			workitem.signatures = {
				activityId: params.activityId,
				baseUrls: {
					url: params.baseUrls,
					signature: params.signature
				}
			};
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createWorkItemsBatchWithHttpInfo(workitem)
			.then(function (results) {
				cb(null, service.formatResponse(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- Utils ---

	// Get Report
	service.GetReportParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			url: service.asIs
		}, params);
		
		return (params);
	};

	service.GetReport = function (n, node, oa2legged, msg, cb) {
		var params = service.GetReportParams(n, msg);

		http.get(
			params.url,
			function (response) {
				response.setEncoding('utf8');
				let rawData = '';
				response.on('data', function (chunk) {
					rawData += chunk;
				});
				response.on('end', function () {
					cb(null, rawData);
				});

				if ( response.statusCode !== 200 )
					cb(response, null);
			}
		);
	};

	// #endregion

	// #region --- Utils for DA ---

	service.getUnqualifiedId = function (id) {
		// if (id.includes('.') && id.includes('+'))
		// 	return (id.split('.')[1].split('+')[0]);
		if (id.includes('.'))
			id = id.split('.')[1];
		if (id.includes('+'))
			id = id.split('+')[0];
		return (id);
	};

	service.splitStringArray = function (stringArray) {
		if (!stringArray)
			return(null);
		if (typeof stringArray === 'string')
			return(stringArray.split("\n"));
		return(stringArray);
	};

	service.dav3API = function (oauth2, oauthType) {
		oauthType = oauthType || '2-legged';
		let apiClient = new dav3.AutodeskForgeDesignAutomationClient( /*config.client*/ );
		if (oauth2)
			apiClient.authManager.authentications[oauthType].accessToken = oauth2.access_token;
		return (new dav3.AutodeskForgeDesignAutomationApi(apiClient));
	};

	service.pagination = function (api, method, params, args) {
		var that = this;
		return (new Promise(function (fulfill, reject) {
			method.apply(api, args)
				.then(function (results) {
					if (params.all && results.data.paginationToken) {
						params.page = results.data.paginationToken;
						service.pagination (api, method, params, args)
							.then(function (results2) {
								results.data.data = [ ...results.data.data, ...results2.data.data] ;
								delete results.data.paginationToken;
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