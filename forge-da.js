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
	const fs = require('fs');
	// const FormData = require('form-data');
	// const path = require('path');
	const dav3 = require('autodesk.forge.designautomation');
	const ForgeAPI = require('forge-apis');

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
				if (node.topic)
					msg.topic = node.topic;
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
				service[node.daProperties.operation](n, node, FORGE, msg, _cb);
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

	// #region --- Activities ---

	// GET	activities
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-GET/
	service.ListActivitiesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString,
			all: service.defaultNullOrEmptyBoolean
		}, params);
		
		return (params);
	};

	service.ListActivities = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivitiesParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivitiesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			engineId: service.asIs,
			bundleId: service.asIs,
			description: service.defaultNullOrEmptyString,
			commandline: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			parameters: service.asIs,
			settings: service.asIs,
		}, params);

		return (params);
	};

	service.CreateActivity = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var body ={
			id: params.activityId,
			engine: params.engineId,
			description: params.description,
			appbundles: params.appbundles ? params.appbundles.split("\n") : null,
			commandLine: params.commandline ? params.commandline.split("\n") : null,
			// settings: params.settings ? params.settings : null,
			// parameters: params.parameters ? params.parameters : null
		};
		if (params.settings) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}
		if (params.parameters) {
			body.parameters ={};
			params.parameters.map(function (elt) {
				body.parameters[elt.id] =JSON.parse(JSON.stringify(elt));
				delete body.parameters[elt.id].id;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityWithHttpInfo(body)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			activityAliasId: service.asIs
		}, params);

		return (params);
	};

	service.GetActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityAliasWithHttpInfo(params.activityId, params.activityAliasId)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
		api.deleteActivityAliasWithHttpInfo(params.activityId, params.activityAliasId)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			aliasId: service.asIs,
			version: service.defaultNullOrEmptyString,
			receiver: service.defaultNullOrEmptyString
		}, params);

		return (params);
	};

	service.UpdateActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.UpdateActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var alias = {
			version: version,
			receiver: receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.modifyActivityAliasWithHttpInfo(params.activityId, params.aliasId, alias)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			all: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListActivityAliases = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivityAliasesParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivityAliasesWithHttpInfo, params, [ params.activityId ])
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			activityAliasId: service.asIs,
			version: service.asIs,
			receiver: service.defaultNullOrEmptyString
		}, params);

		return (params);
	};

	service.CreateActivityAlias = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityAliasParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var alias = {
			id: params.activityAliasId,
			version: params.version,
			receiver: params.receiver
		};

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityAliasWithHttpInfo(params.activityId, alias)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			activityId: service.asIs
		}, params);

		return (params);
	};

	service.GetActivity = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityParams(n, msg);
		//params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityWithHttpInfo(params.activityId)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
				cb(null, service.formatResponse(results));
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
			all: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ListActivityVersions = function (n, node, oa2legged, msg, cb) {
		var params = service.ListActivityVersionsParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getActivityVersionsWithHttpInfo, params, [ params.activityId, params ])
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			engineId: service.asIs,
			bundleId: service.asIs,
			description: service.defaultNullOrEmptyString,
			commandline: service.defaultNullOrEmptyString,
			appbundles: service.defaultNullOrEmptyString,
			parameters: service.asIs,
			settings: service.asIs,
		}, params);

		return (params);
	};

	service.CreateActivityVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.CreateActivityVersionParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var body ={
			//id: params.activityId,
			engine: params.engineId,
			description: params.description,
			appbundles: params.appbundles ? params.appbundles.split("\n") : null,
			commandLine: params.commandline ? params.commandline.split("\n") : null,
			// settings: params.settings ? params.settings : null,
			// parameters: params.parameters ? params.parameters : null,
			//version: params.version
		};
		if (params.settings) {
			body.settings ={};
			params.settings.map(function (elt) {
				body.settings[elt.key] =JSON.parse(JSON.stringify(elt));
				delete body.settings[elt.key].key;
			});
		}
		if (params.parameters) {
			body.parameters ={};
			params.parameters.map(function (elt) {
				body.parameters[elt.id] =JSON.parse(JSON.stringify(elt));
				delete body.parameters[elt.id].id;
			});
		}

		var api = service.dav3API(oa2legged.getCredentials());
		api.createActivityVersionWithHttpInfo(params.activityId, body)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
			version: service.asIs
		}, params);

		return (params);
	};

	service.GetActivityVersion = function (n, node, oa2legged, msg, cb) {
		var params = service.GetActivityVersionParams(n, msg);
		params.activityId = service.getUnqualifiedId(params.activityId);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getActivityVersionWithHttpInfo(params.activityId, params.version)
			.then(function (results) {
				cb(null, service.formatResponse(results));
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
				cb(null, service.formatResponse(results));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});	
	};
  
	// #endregion

	// #region --- AppBundles ---
	// #endregion

	// #region --- Engines ---

	// GET	engines
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-GET/
	service.ListEnginesParams = function (n, msg) {
		var params = {};
		
		service.getParams(n, msg, {
			page: service.defaultNullOrEmptyString
		}, params);

		return (params);
	};

	service.ListEngines = function (n, node, oa2legged, msg, cb) {
		var params = service.ListEnginesParams(n, msg);
		
		var api = service.dav3API(oa2legged.getCredentials());
		service.pagination(api, api.getEnginesWithHttpInfo, params, [ params ])
			.then(function (results) {
				cb(null, service.formatResponse(results));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// GET	engines/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-id-GET/
	service.GetEngineParams = function (n, msg) {
		var params = {};
		service.copyArg(msg, 'engineId', params, undefined, false);
		return (params);
	};

	service.GetEngine = function (n, node, oa2legged, msg, cb) {
		var params = service.GetEngineParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.getEngineWithHttpInfo(params.engineId)
			.then(function (results) {
				cb(null, service.formatResponse(results));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- ForgeApps ---
	// #endregion

	// #region --- Health ---

	// GET	health/:id
	// https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/engines-id-GET/
	service.GetHealthParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			engineId: service.asIs
		}, params);

		return (params);
	};

	service.GetHealth = function (n, node, oa2legged, msg, cb) {
		var params = service.GetHealthParams(n, msg);

		var api = service.dav3API(oa2legged.getCredentials());
		api.healthStatusWithHttpInfo(params.engineId)
			.then(function (results) {
				cb(null, service.formatResponse(results));
			})
			.catch(function (error) {
				cb(service.formatError(error), null);
			});
	};

	// #endregion

	// #region --- ServiceLimits ---
	// #endregion

	// #region --- Shares ---
	// #endregion

	// #region --- WorkItems ---
	// #endregion


	// service.CreateorUpdateActivity = async function (n, node, oa2legged, msg, cb) {
	//   const {
	//     FORGE_CLIENT_ID,
	//     FORGE_CLIENT_SECRET
	//   } = process.env;
	//   const client = new DesignAutomationClient({
	//     client_id: FORGE_CLIENT_ID,
	//     client_secret: FORGE_CLIENT_SECRET
	//   });
	//   const ACTIVITY_NAME = n.activityId;
	//   const ACTIVITY_DESCRIPTION = n.activityDesc;
	//   const ACTIVITY_ALIAS = n.activityAlias;
	//   const APPBUNDLE_NAME = n.bundleId;
	//   const APPBUNDLE_ALIAS = n.bundleAlias;
	//   const APPBUNDLE_ENGINE = n.engine;
	//   const allActivities = await client.listActivities();
	//   const matchingActivities = allActivities.filter(
	//     item => item.indexOf('.' + ACTIVITY_NAME + '+') !== -1
	//   );
	//   let activityInputs = [{
	//       name: 'inputFile',
	//       description: 'Host Drawing',
	//       zip: false,
	//       ondemand: false,
	//       verb: 'get',
	//       localName: '$(inputFile)'
	//     },
	//     {
	//       name: 'inputJson',
	//       description: 'input json',
	//       zip: false,
	//       ondemand: false,
	//       verb: 'get',
	//       localName: 'params.json'
	//     }
	//   ];
	//   let activityOutputs = [{
	//     name: 'outputFile',
	//     description: 'output file',
	//     zip: false,
	//     ondemand: false,
	//     verb: 'put',
	//     localName: 'outputFile.dwg',
	//     required: true
	//   }];
	//   let script = 'UpdateParam\n';
	//   if (msg.hasOwnProperty('payload') && typeof msg.payload !== 'undefined') {
	//     if (msg.payload.activityInputs) {
	//       activityInputs = msg.payload.activityInputs;
	//     }
	//     if (msg.payload.activityOutputs) {
	//       activityOutputs = msg.payload.activityOutputs;
	//     }
	//     if (msg.payload.script) {
	//       script = msg.payload.script;
	//     }
	//   }
	//   let activity;
	//   try {
	//     if (matchingActivities.length === 0) {
	//       activity = await client.createActivity(
	//         ACTIVITY_NAME,
	//         ACTIVITY_DESCRIPTION,
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ALIAS,
	//         APPBUNDLE_ENGINE,
	//         activityInputs,
	//         activityOutputs,
	//         script
	//       );
	//     } else {
	//       activity = await client.updateActivity(
	//         ACTIVITY_NAME,
	//         ACTIVITY_DESCRIPTION,
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ALIAS,
	//         APPBUNDLE_ENGINE,
	//         activityInputs,
	//         activityOutputs,
	//         script
	//       );
	//     }
	//   } catch (err) {
	//     cb('Could not create or update activity', null);
	//   }
	//   cb(null, activity);

	//   // Create or update an activity alias
	//   const allActivityAliases = await client.listActivityAliases(ACTIVITY_NAME);
	//   const matchingActivityAliases = allActivityAliases.filter(
	//     item => item.id === ACTIVITY_ALIAS
	//   );
	//   let activityAlias;
	//   try {
	//     if (matchingActivityAliases.length === 0) {
	//       activityAlias = await client.createActivityAlias(
	//         ACTIVITY_NAME,
	//         ACTIVITY_ALIAS,
	//         activity.version
	//       );
	//     } else {
	//       activityAlias = await client.updateActivityAlias(
	//         ACTIVITY_NAME,
	//         ACTIVITY_ALIAS,
	//         activity.version
	//       );
	//     }
	//   } catch (err) {
	//     cb('Could not create or update activity alias', null);
	//   }
	//   cb(null, activityAlias);
	// };







	// // GET	activities/:id/versions
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/activities-id-versions-GET/
	// service.ListAppbundleVersions = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let versions = await client.listAppBundleVersions(n.bundleId);
	//     cb(null, versions);
	//   } catch (err) {
	//     cb(err, null);
	//   }
	// };

	

	// // GET	appbundles
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-GET/
	// service.ListAppbundles = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let details = await client.listAppBundles();
	//     cb(null, details);
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	// // GET	appbundles/:id
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-id-GET/
	// service.GetAppbundle = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });

	//   const designAutomationId = new DesignAutomationID(
	//     oa2legged.clientId,
	//     n.bundleId,
	//     n.bundleAlias
	//   );
	//   let qualifiedId = designAutomationId.toString();

	//   try {
	//     let details = await client.getAppBundle(qualifiedId);
	//     cb(null, details);
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	// service.CreateOrUpdateAppbundle = async function (
	//   n,
	//   node,
	//   oa2legged,
	//   msg,
	//   cb
	// ) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });

	//   const APPBUNDLE_NAME = n.bundleId;
	//   const APPBUNDLE_ALIAS = n.bundleAlias;
	//   const APPBUNDLE_ENGINE = n.engine;
	//   let APPBUNDLE_FILE = n.bundleFile;
	//   const APPBUNDLE_DESCRIPTIION = n.bundleDesc;
	//   const allAppBundles = await client.listAppBundles();
	//   const matchingAppBundles = allAppBundles.filter(
	//     item => item.indexOf(APPBUNDLE_NAME) !== -1
	//   );
	//   let appBundle;
	//   try {
	//     if (matchingAppBundles.length === 0) {
	//       appBundle = await client.createAppBundle(
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ENGINE,
	//         APPBUNDLE_DESCRIPTIION
	//       );
	//     } else {
	//       appBundle = await client.updateAppBundle(
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ENGINE,
	//         APPBUNDLE_DESCRIPTIION
	//       );
	//     }
	//     cb(null, appBundle);
	//   } catch (err) {
	//     cb(err, null);
	//   }

	//   // Upload appbundle zip file
	//   try {
	//     var file = path.normalize(APPBUNDLE_FILE);
	//     if (!path.isAbsolute(APPBUNDLE_FILE)) {
	//       node.error('Absolute Path Required');
	//       return;
	//     }
	//     var res = await uploadAppBundleFile(appBundle, file);
	//     cb(null, `File Upload is ${res.statusMessage} and ${res.statusCode}`);
	//   } catch (err) {
	//     cb(err, null);
	//   }

	//   // Create or update an appbundle alias
	//   const allAppBundleAliases = await client.listAppBundleAliases(
	//     APPBUNDLE_NAME
	//   );
	//   const matchingAppBundleAliases = allAppBundleAliases.filter(
	//     item => item.id === APPBUNDLE_ALIAS
	//   );
	//   let appBundleAlias;
	//   try {
	//     if (matchingAppBundleAliases.length === 0) {
	//       appBundleAlias = await client.createAppBundleAlias(
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ALIAS,
	//         appBundle.version
	//       );
	//     } else {
	//       appBundleAlias = await client.updateAppBundleAlias(
	//         APPBUNDLE_NAME,
	//         APPBUNDLE_ALIAS,
	//         appBundle.version
	//       );
	//     }
	//   } catch (err) {
	//     //.error('Could not create or update appbundle alias', err);
	//     cb(err, null);
	//   }
	//   // console.log('AppBundle alias', appBundleAlias);
	//   cb(null, appBundleAlias);
	// };

	
	// // GET	appbundles/:id/aliases
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-id-aliases-GET/
	// service.ListAppbundleAliases = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let aliases = await client.listAppBundleAliases(n.bundleId);
	//     cb(null, Object.assign({}, aliases));
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	// // DELETE	appbundles/:id
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-id-DELETE/
	// service.DeleteAppbundle = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let res = await client.deleteAppBundle(n.bundleId);
	//     cb(null, res);
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	// // DELETE	appbundles/:id/aliases/:aliasId
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-id-aliases-aliasId-DELETE/
	// service.DeleteAppbundleAlias = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let res = await client.deleteAppBundleAlias(n.bundleId, n.bundleAlias);
	//     cb(null, res);
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	// // DELETE	appbundles/:id/versions/:version
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/appbundles-id-versions-version-DELETE/
	// service.DeleteAppbundleVersion = async function (n, node, oa2legged, msg, cb) {
	//   const client = new DesignAutomationClient({
	//     token: oa2legged.credentials.access_token
	//   });
	//   try {
	//     let res = await client.deleteAppBundleVersion(
	//       n.bundleId,
	//       n.bundleVersion
	//     );
	//     cb(null, res);
	//   } catch (error) {
	//     cb(service.formatError(error), null);
	//   }
	// };

	

	// // POST	workitems
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-POST/
	// service.CreateWorkitem = async function (n, node, oa2legged, msg, cb) {
	//   const FORGE_BUCKET = n.bucket;
	//   const INPUT_FILE_PATH = n.inputFile;
	//   const INPUT_OBJECT_KEY = n.inputObjectKey;
	//   const OUTPUT_OBJECT_KEY = n.outputObjectKey;

	//   const {
	//     FORGE_CLIENT_ID,
	//     FORGE_CLIENT_SECRET
	//   } = process.env;
	//   // Create bucket if it doesn't exist
	//   const dm = new DataManagementClient({
	//     client_id: FORGE_CLIENT_ID,
	//     client_secret: FORGE_CLIENT_SECRET
	//   });
	//   const allBuckets = await dm.listBuckets();
	//   console.log(allBuckets);
	//   const matchingBuckets = allBuckets.filter(
	//     item => item.bucketKey === FORGE_BUCKET
	//   );
	//   if (matchingBuckets.length === 0) {
	//     try {
	//       let bucketDetail = await dm.createBucket(FORGE_BUCKET, 'persistent');
	//       cb(null, bucketDetail);
	//     } catch (err) {
	//       cb('Could not create bucket', null);
	//     }
	//   }

	//   // Upload Drawing file and create a placeholder for the output result drawing file
	//   const inputObjectBuff = fs.readFileSync(INPUT_FILE_PATH);
	//   try {
	//     let objectDetail = await dm.uploadObject(
	//       FORGE_BUCKET,
	//       INPUT_OBJECT_KEY,
	//       'application/octet-stream',
	//       inputObjectBuff
	//     );
	//     cb(null, objectDetail);
	//   } catch (err) {
	//     cb('Could not upload input file', null);
	//   }

	//   // Generate signed URLs for all input and output files
	//   let inputFileSignedUrl;
	//   let outputSignedUrl;
	//   try {
	//     inputFileSignedUrl = await dm.createSignedUrl(
	//       FORGE_BUCKET,
	//       INPUT_OBJECT_KEY,
	//       'read'
	//     );
	//     outputSignedUrl = await dm.createSignedUrl(
	//       FORGE_BUCKET,
	//       OUTPUT_OBJECT_KEY,
	//       'readwrite'
	//     );
	//   } catch (err) {
	//     console.error('Could not generate signed URLs', err);
	//     process.exit(1);
	//   }

	//   const client = new DesignAutomationClient({
	//     client_id: FORGE_CLIENT_ID,
	//     client_secret: FORGE_CLIENT_SECRET
	//   });
	//   // Create work item and poll the results
	//   const activityId = new DesignAutomationID(
	//     oa2legged.clientId,
	//     n.activityId,
	//     n.activityAlias
	//   );
	//   let workitemInputs = [{
	//       name: 'inputFile',
	//       url: inputFileSignedUrl.signedUrl
	//     },
	//     {
	//       name: 'inputJson',
	//       url: 'data:application/json,{"Width":"40","Height":"80"}'
	//     }
	//   ];
	//   let workitemOutputs = [{
	//     name: 'outputFile',
	//     url: outputSignedUrl.signedUrl
	//   }];

	//   let workitem;
	//   try {
	//     workitem = await client.createWorkItem(
	//       activityId.toString(),
	//       workitemInputs,
	//       workitemOutputs
	//     );
	//     console.log('Workitem', workitem);
	//     while (
	//       workitem.status === 'inprogress' ||
	//       workitem.status === 'pending'
	//     ) {
	//       await sleep(5000);
	//       workitem = await client.workItemDetails(workitem.id);
	//       workitem.outputSignedUrl = outputSignedUrl.signedUrl;
	//       cb(null, workitem);
	//     }
	//   } catch (err) {
	//     cb(err.stack, null);
	//   }
	// };

	// // GET	workitems/:id
	// // https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/workitems-id-GET/
	// service.GetWorkitem = async function (n, node, oa2legged, msg, cb) {
	//   const {
	//     FORGE_CLIENT_ID,
	//     FORGE_CLIENT_SECRET
	//   } = process.env;
	//   const client = new DesignAutomationClient({
	//     client_id: FORGE_CLIENT_ID,
	//     client_secret: FORGE_CLIENT_SECRET
	//   });
	//   let workitem;
	//   try {
	//     workitem = await client.workItemDetails(n.workitemId);
	//     cb(null, workitem);
	//   } catch (error) {
	//     cb(error.stack, null);
	//   }
	// };


	// // Utils:
	// function uploadAppBundleFile(appBundle, appBundleFilename) {
	//   const uploadParameters = appBundle.uploadParameters.formData;
	//   const form = new FormData();
	//   form.append('key', uploadParameters.key);
	//   form.append('policy', uploadParameters.policy);
	//   form.append('content-type', uploadParameters['content-type']);
	//   form.append(
	//     'success_action_status',
	//     uploadParameters.success_action_status
	//   );
	//   form.append(
	//     'success_action_redirect',
	//     uploadParameters.success_action_redirect
	//   );
	//   form.append('x-amz-signature', uploadParameters['x-amz-signature']);
	//   form.append('x-amz-credential', uploadParameters['x-amz-credential']);
	//   form.append('x-amz-algorithm', uploadParameters['x-amz-algorithm']);
	//   form.append('x-amz-date', uploadParameters['x-amz-date']);
	//   form.append(
	//     'x-amz-server-side-encryption',
	//     uploadParameters['x-amz-server-side-encryption']
	//   );
	//   form.append(
	//     'x-amz-security-token',
	//     uploadParameters['x-amz-security-token']
	//   );
	//   form.append('file', fs.createReadStream(appBundleFilename));
	//   return new Promise(function (resolve, reject) {
	//     form.submit(appBundle.uploadParameters.endpointURL, function (err, res) {
	//       if (err) {
	//         reject(err);
	//       } else {
	//         resolve(res);
	//       }
	//     });
	//   });
	// }

	// function sleep(ms) {
	//   return new Promise(function (resolve, reject) {
	//     setTimeout(function () {
	//       resolve();
	//     }, ms);
	//   });
	// }

	// Utils
	service.asIs = {};
	service.defaultNullOrEmptyString = {
		type: 'string',
		default: [null, '']
	};
	service.defaultNullOrEmptyDate = {
		type: 'date',
		default: [null, '']
	};
	service.defaultNullOrEmptyBoolean = {
		type: 'bool',
		default: [null, false]
	};

	service.copyArg = function (src, arg, out, outArg, isObject) {
		outArg = (typeof outArg !== 'undefined') ? outArg : arg; // map property
		var tmpValue = src[arg];
		if (typeof tmpValue !== 'undefined') {
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
				tmpValue = JSON.parse(stmpValue);
			out[outArg] = tmpValue;
		} else if (src.payload && src.payload.hasOwnProperty(arg) && typeof src.payload[arg] !== 'undefined') {
			tmpValue = src.payload[arg];
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
				tmpValue = JSON.parse(stmpValue);
			out[outArg] = tmpValue;
		} else if (src.topic === arg) {
			tmpValue = src.payload;
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
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

	service.getUnqualifiedId = function (id) {
		// if (id.includes('.') && id.includes('+'))
		// 	return (id.split('.')[1].split('+')[0]);
		if (id.includes('.'))
			id = id.split('.')[1];
		if (id.includes('+'))
			id = id.split('+')[0];
		return (id);
	};

	service.dav3API = function (oauth2) {
		let apiClient = new dav3.AutodeskForgeDesignAutomationClient( /*config.client*/ );
		apiClient.authManager.authentications['2-legged'].accessToken = oauth2.access_token;
		return (new dav3.AutodeskForgeDesignAutomationApi(apiClient));
	};

	service.formatResponse = function (response) {
		response.statusCode = response.response.statusCode;
		response.headers = response.response.headers;
		if (response.hasOwnProperty ('data')) {
			response.body = JSON.parse(JSON.stringify(response.data));
			delete response.data;
		}
		delete response.response;
		return (response);
	};

	service.formatError = function (error) {
		console.error(error);
		if (error.response.statusCode)
			error.statusCode = error.response.statusCode;
		error.headers = error.response.headers;
		if (error.response.hasOwnProperty ('body')) {
			error.details = JSON.parse(JSON.stringify(error.response.body));
		} else {
			error.details = error.response.text;
		}
		delete error.response;
		return (error);
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

};