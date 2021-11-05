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
	const utils = require('./utils');
	const ForgeAPI = require('forge-apis');

	// Forge
	function ForgeDMNode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.dmProperties = n;
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
					msgErr.err.op = 'dm:' + node.dmProperties.operation;
					node.send([null, msgErr]);
					return;
				}

				msg.payload = data;
				node.status({});
				msg.topic = node.dmProperties.topic || node.topic;
				msg.op = 'dm:' + node.dmProperties.operation;
				node.send([msg, null]);
			};

			var _cb = function (err, data) {
				node.sendMsg(err, data);
			};

			if (typeof service[node.dmProperties.operation] === 'function') {
				node.status({
					fill: 'blue',
					shape: 'dot',
					text: node.dmProperties.operation
				});
				service[node.dmProperties.operation](n, node, await FORGE, msg, _cb);
			} else {
				node.error(RED._('forge.error.unknown-operation', {
					op: node.dmsProperties.operation
				}));
			}
		}

		node.on('input', onInput);
	}

	RED.nodes.registerType('forge-dm', ForgeDMNode);

	var service = {};
	utils(service);

	service.decodeFilters = function (params) {
		if (!params.filters)
			return (params);

		var t = params.filters.map(function (elt) {
			var name = 'filter[' + elt.id + ']' + elt.modifier;
			if (elt.id === 'custom')
				name = 'filter[' + elt.custom + ']' + elt.modifier;
			if (!params.hasOwnProperty(name))
				params[name] = [];
			params[name].push(elt.expr);
		});
		delete params.filters;

		return (params);
	};

	// #region --- 3legged ---

	service.AuthorizeParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.Authorize = function (n, node, oa3legged, msg, cb) {
		var params = service.AuthorizeParams(n, msg);

		var url = oa3legged.generateAuthUrl();
		if (!params.raw)
			url = '"' + url.replace(/ /g, '%20') + '"';
		cb(null, url);
	};

	service.GetTokenParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			code: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.GetToken = function (n, node, oa3legged, msg, cb) {
		var params = service.GetTokenParams(n, msg);

		oa3legged.getToken(params.code)
			.then((credentials) => {
				oa3legged.credentials = credentials;
				node.forgeCredentials.saveCredentials(credentials);
				cb(null, true);
			})
			.catch((error) => {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	service.Refresh = function (n, node, oa3legged, msg, cb) {
		if ( !oa3legged.credentials.hasOwnProperty('refresh_token') )
			return (cb(null, false));
		oa3legged.refreshToken(oa3legged.credentials)
			.then((credentials) => {
				oa3legged.credentials = credentials;
				node.forgeCredentials.saveCredentials(credentials);
				cb(null, true);
			})
			.catch((error) => {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	service.MeParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.Me = function (n, node, oa3legged, msg, cb) {
		var params = service.MeParams(n, msg);

		var api = new ForgeAPI.UserProfileApi();
		api.getUserProfile(oa3legged, oa3legged.credentials)
			.then((results) => {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch((error) => {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Hubs ---

	// GET Hubs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-GET/
	service.ListHubsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[id]
			// filter[name]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.ListHubs = function (n, node, oa3legged, msg, cb) {
		var params = service.ListHubsParams(n, msg);

		var api = new ForgeAPI.HubsApi();
		api.getHubs(params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET hubs/:hub_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-GET/
	service.HubDetailsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			xuserid: service.defaultNullOrEmptyString,
			hubid: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.HubDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.HubDetailsParams(n, msg);

		var api = new ForgeAPI.HubsApi();
		//api.getHub(params.hubid, oa3legged, oa3legged.credentials)
		api.getHub2(params.hubid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Projects ---

	// GET hubs/:hub_id/projects
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-GET/
	service.ListProjectsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			hubid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[id]
			// filter[extension.type]
			pageNumber: service.defaultNullOrEmptyString,
			pageLimit: service.defaultNullOrEmptyString,
			// page[number]
			// page[limit]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params.pageNumber = params.pageNumber && params.pageNumber.split(',');
		params.pageLimit = params.pageLimit && params.pageLimit.split(',');

		params = service.decodeFilters(params);

		return (params);
	};

	service.ListProjects = function (n, node, oa3legged, msg, cb) {
		var params = service.ListProjectsParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getHubProjects(params.hubid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	hubs/:hub_id/projects/:project_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-GET/
	service.ProjectDetailsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			hubid: service.asIs,
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ProjectDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.ProjectDetailsParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getProject2(params.hubid, params.projectid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	hubs/:hub_id/projects/:project_id/hub
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-hub-GET/
	service.ProjectHubDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.ProjectDetailsParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getProjectHub2(params.hubid, params.projectid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	hubs/:hub_id/projects/:project_id/topFolders
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-topFolders-GET/
	service.ListFolders = function (n, node, oa3legged, msg, cb) {
		var params = service.ProjectDetailsParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getProjectTopFolders2(params.hubid, params.projectid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	projects/:project_id/downloads/:download_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-downloads-download_id-GET/
	service.DownloadParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			downloadid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.Download = function (n, node, oa3legged, msg, cb) {
		var params = service.DownloadParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getDownload(params.projectid, params.downloadid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET	projects/:project_id/jobs/:job_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-jobs-job_id-GET/
	service.JobInfoParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			jobid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.JobInfo = function (n, node, oa3legged, msg, cb) {
		var params = service.JobInfoParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.getJob(params.projectid, params.jobid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST	projects/:project_id/downloads
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-downloads-POST/
	service.CreateDownloadTypeParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateDownloadType = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateDownloadTypeParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.postDownload(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST	projects/:project_id/storage
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-storage-POST/
	service.CreateStorageParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateStorage = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateStorageParams(n, msg);

		var api = new ForgeAPI.ProjectsApi();
		api.postStorage2(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Folders ---

	// GET projects/:project_id/folders/:folder_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-GET/
	service.FolderDetailsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			ifModifiedSince: service.defaultNullOrEmptyDate,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.FolderDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderDetailsParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolder2(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/contents
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-contents-GET/
	service.FolderContentsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			pageNumber: service.defaultNullOrEmptyString,
			pageLimit: service.defaultNullOrEmptyString,
			// page[number]
			// page[limit]
			includeHidden: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params.pageNumber = params.pageNumber && params.pageNumber.split(',');
		params.pageLimit = params.pageLimit && params.pageLimit.split(',');
		
		params = service.decodeFilters(params);

		return (params);
	};

	service.FolderContents = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderContentsParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolderContents(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/parent
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-parent-GET/
	service.FolderParentParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.FolderParent = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderParentParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolderParent2(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-refs-GET/
	service.FolderRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.FolderRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderRefsParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolderRefs(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/relationships/links
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-relationships-links-GET/
	service.FolderRelationshipsLinksParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			// filter[mimeType]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.FolderRelationshipsLinks = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderRelationshipsLinksParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolderRelationshipsLinks(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-relationships-refs-GET/
	service.FolderRelationshipsRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[refType]
			// filter[extension.type]
			// filter[direction]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.FolderRelationshipsRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.FolderRelationshipsRefsParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.getFolderRelationshipsRefs(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/folders/:folder_id/search
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-search-GET/
	service.SearchParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			filters: service.asIs,
			// filter[*]
			pageNumber: service.defaultNullOrEmptyString,
			pageLimit: service.defaultNullOrEmptyString,
			// page[number]
			// page[limit]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params.pageNumber = params.pageNumber && params.pageNumber.split(',');
		params.pageLimit = params.pageLimit && params.pageLimit.split(',');

		params = service.decodeFilters(params);

		return (params);
	};

	service.Search = function (n, node, oa3legged, msg, cb) {
		var params = service.SearchParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.search(params.projectid, params.folderid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/folders
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-POST/
	service.CreateFolderParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
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

		var api = new ForgeAPI.FoldersApi();
		api.postFolder2(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/folders/:folder_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-relationships-refs-POST/
	service.CreateFolderRelationshipsRefParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateFolderRelationshipsRef = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateFolderRelationshipsRefParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.postFolderRelationshipsRef2(params.projectid, params.folderid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// PATCH projects/:project_id/folders/:folder_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-folders-folder_id-PATCH/
	service.ModifyFolderParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			folderid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.ModifyFolder = function (n, node, oa3legged, msg, cb) {
		var params = service.ModifyFolderParams(n, msg);

		var api = new ForgeAPI.FoldersApi();
		api.patchFolder(params.projectid, params.folderid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Items ---

	// GET projects/:project_id/items/:item_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-GET/
	service.ItemDetailsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			includePathInProject: service.defaultNullOrEmptyBoolean,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ItemDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemDetailsParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItem2(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/parent
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-parent-GET/
	service.ItemParentFolderParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ItemParentFolder = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemParentFolderParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemParentFolder2(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-refs-GET/
	service.ItemRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.ItemRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemRefsParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemRefs(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/relationships/links
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-relationships-links-GET/
	service.ItemRelationshipsLinksParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			// filter[mimeType]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.ItemRelationshipsLinks = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemRelationshipsLinksParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemRelationshipsLinks(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-relationships-refs-GET/
	service.ItemRelationshipsRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[refType]
			// filter[direction]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.ItemRelationshipsRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemRelationshipsRefsParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemRelationshipsRefs(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/tip
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-tip-GET/
	service.ItemTipParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.ItemTip = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemTipParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemTip2(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/items/:item_id/versions
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-versions-GET/
	service.ItemVersionsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			// filter[versionNumber]
			pageNumber: service.defaultNullOrEmptyString,
			pageLimit: service.defaultNullOrEmptyString,
			// page[number]
			// page[limit]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params.pageNumber = params.pageNumber && params.pageNumber.split(',');
		params.pageLimit = params.pageLimit && params.pageLimit.split(',');

		params = service.decodeFilters(params);

		return (params);
	};

	service.ItemVersions = function (n, node, oa3legged, msg, cb) {
		var params = service.ItemVersionsParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.getItemVersions(params.projectid, params.itemid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/items
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-POST/
	service.CreateItemVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			copyFrom: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateItemVersion = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateItemVersionParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.postItem2(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/items/:item_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-relationships-refs-POST/
	service.CreateItemRelationshipsRefParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateItemRelationshipsRef = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateItemRelationshipsRefParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.postItemRelationshipsRef2(params.projectid, params.itemid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// PATCH projects/:project_id/items/:item_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-items-item_id-PATCH/
	service.ModifyItemParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			itemid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.ModifyItem = function (n, node, oa3legged, msg, cb) {
		var params = service.ModifyItemParams(n, msg);

		var api = new ForgeAPI.ItemsApi();
		api.patchItem(params.projectid, params.itemid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

	// #region --- Versions ---

	// GET projects/:project_id/versions/:version_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-GET/
	service.VersionDetailsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.VersionDetails = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionDetailsParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersion2(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/downloadFormats
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-downloadFormats-GET/
	service.VersionDownloadFormatsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.VersionDownloadFormats = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionDownloadFormatsParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionDownloadFormats(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/downloads
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-downloads-GET/
	service.VersionDownloadsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[format.fileType]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.VersionDownloads = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionDownloadsParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionDownloads(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/item
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-item-GET/
	service.VersionItemParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		return (params);
	};

	service.VersionItem = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionItemParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionItem2(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-refs-GET/
	service.VersionRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.VersionRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionRefsParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionRefs(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/relationships/links
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-relationships-links-GET/
	service.VersionRelationshipsLinksParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[extension.type]
			// filter[mimeType]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.VersionRelationshipsLinks = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionRelationshipsLinksParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionRelationshipsLinks(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// GET projects/:project_id/versions/:version_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-relationships-refs-GET/
	service.VersionRelationshipsRefsParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			filters: service.asIs,
			// filter[type]
			// filter[id]
			// filter[refType]
			// filter[direction]
			// filter[extension.type]
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		params = service.decodeFilters(params);

		return (params);
	};

	service.VersionRelationshipsRefs = function (n, node, oa3legged, msg, cb) {
		var params = service.VersionRelationshipsRefsParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.getVersionRelationshipsRefs(params.projectid, params.versionid, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/versions
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-POST/
	service.CreateVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			copyFrom: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateVersion = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateVersionParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.postVersion2(params.projectid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// POST projects/:project_id/versions/:version_id/relationships/refs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-relationships-refs-POST/
	service.CreateVersionRelationshipsRefParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.CreateVersionRelationshipsRef = function (n, node, oa3legged, msg, cb) {
		var params = service.CreateVersionRelationshipsRefParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.postVersionRelationshipsRef2(params.projectid, params.versionid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// PATCH projects/:project_id/versions/:version_id
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-versions-version_id-PATCH/
	service.ModifyVersionParams = function (n, msg) {
		var params = {};

		service.getParams(n, msg, {
			projectid: service.asIs,
			versionid: service.asIs,
			xuserid: service.defaultNullOrEmptyString,
			contentType: service.asIs,
			body: service.asIs,
			raw: service.defaultNullOrEmptyBoolean
		}, params);

		try {
			params.body = JSON.parse(params.body);
		} catch (ex) {}

		return (params);
	};

	service.ModifyVersion = function (n, node, oa3legged, msg, cb) {
		var params = service.ModifyVersionParams(n, msg);

		var api = new ForgeAPI.VersionsApi();
		api.patchVersion(params.projectid, params.versionid, params.body, params, oa3legged, oa3legged.credentials)
			.then(function (results) {
				cb(null, service.formatResponseOldSDK(results, params.raw));
			})
			.catch(function (error) {
				cb(service.formatErrorOldSDK(error), null);
			});
	};

	// #endregion

};