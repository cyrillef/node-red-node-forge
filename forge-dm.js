module.exports = function(RED) {
  "use strict";
  var url = require("url");
  var fs = require("fs");
  var uuidv4 = require("uuid/v4");
  var streamBuffers = require("stream-buffers");
  var ForgeAPI = require("forge-apis");

  // Forge
  function ForgeDMNode(n) {
    RED.nodes.createNode(this, n);
    this.forgeCredentials = RED.nodes.getNode(n.forge);
    var globalContext = this.context().global;
    this.ossProperties = n;
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
          node.warn(RED._("forge.warn.missing-credentials"));
          return;
        }
        node._forgeCredentials = true;
        var forgeDefaultCredentials = null;
        RED.nodes.eachNode(elt => {
          // elt.type === 'forge-*'
          // https://discourse.nodered.org/t/how-to-get-flow-id-by-function-node/9889
          if (
            node._forgeCredentials &&
            elt.type === "forge-default-credentials"
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

      node.sendMsg = function(err, data) {
        if (err) {
          var text = "error";
          if (err.statusCode) text = `${err.statusCode}: ${err.statusMessage}`;
          else if (err.message) text = err.message;

          node.status({
            fill: "red",
            shape: "ring",
            text: text
          });
          //node.error('failed: ' + err.toString(), msg);
          var msgErr = {
            err: err
          };
          var keys = Object.keys(msg);
          for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (
              ["payload", "_msgid", "__proto__"].includes(key) ||
              msgErr.hasOwnProperty(key)
            )
              continue;
            msgErr[key] = msg[key];
          }
          msgErr.err.op = "oss:" + node.ossProperties.operation;
          node.send([null, msgErr]);
          return;
        }

        msg.payload = data;
        node.status({});
        msg.topic = node.topic;
        node.send([msg, null]);
      };

      var _cb = function(err, data) {
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
        node.error(
          RED._("forge.error.unknown-operation", {
            op: node.ossProperties.operation
          })
        );
      }
    }

    node.on("input", onInput);
  }

  RED.nodes.registerType("forge-dm", ForgeDMNode);

  var service = {};   

  // Retrieving Hub_ID from node property
  service.HubKey = function (src, out) {
		try {
			if ((src.hubType === null && src.hub === '') || src.hubType === 'none') {
				src.hubType = 'env';
				src.hub = 'HUB_ID';
			}
			out.hub = RED.util.evaluateNodeProperty(src.hub, src.hubType, src, out);
		} catch (err) {
			out.hub = src.hub;
		}
  };

  // Retrieving Project_ID from node property
  service.ProjectKey = function (src, out) {
		try {
			if ((src.projectType === null && src.project === '') || src.projectType === 'none') {
				src.projectType = 'env';
				src.project = 'PROJECT_ID';
			}
			out.project = RED.util.evaluateNodeProperty(src.project, src.projectType, src, out);
		} catch (err) {
			out.project = src.project;
		}
  };  
  
  // Returns param deatils with Project_ID
	service.ProjectDetailsParams = function (n, msg) {
		var params = {}; 
		service.ProjectKey(n, params); 
		return (params);
	};

  // Returns param deatils with Hub_ID
	service.HubDetailsParams = function (n, msg) {
		var params = {}; 
		service.HubKey(n, params); 
		return (params);
  };
  
  // GET Hubs
	// https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-GET/
  service.ListHubs = function (n, node, oa2legged, msg, cb) {
		var dmHubs = new ForgeAPI.HubsApi();		
		dmHubs.getHubs({},node.forgeCredentials.client3Legged,node.forgeCredentials.internalCredentials)
		.then(function(hubs){
			//console.log(JSON.stringify(hubs.body.items, null, 4));
			if (!hubs.body.hasOwnProperty('next')) {
				cb(null, hubs);
			} else {
				var url_parts = url.parse(hubs.body.next, true);
				hubs.body.nextKey = url_parts.query.startAt;
				hubs.body.limit = url_parts.query.limit;
				//hubs.body.region = params.region;
				cb(null, hubs);
			}
		})
		.catch(function(error){
			console.log('list hub errors');
			cb(error,null);
		});
	};

  //GET hubs/:hub_id
  //https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-GET/
	service.HubDetails = function (n, node, oa2legged, msg, cb) {
		var params = service.HubDetailsParams(n, msg);

		var dmhub = new ForgeAPI.HubsApi();
		console.log(params.hub)
		dmhub.getHub(params.hub, node.forgeCredentials.client3Legged, node.forgeCredentials.internalCredentials)
			.then(function (hub) {
				//console.log(JSON.stringify(buckets.body.items, null, 4));
				cb(null, hub);
			})
			.catch(function (error) {
				cb(error, null);
			});
		//cb(null, params);
  };

  //GET hubs/:hub_id/projects
  //https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-GET/
  service.ListProjects = function (n, node, oa2legged, msg, cb) {
		var params = service.HubDetailsParams(n, msg);

    var dmproject = new ForgeAPI.ProjectsApi(); 
    console.log(params.hub);
		dmproject.getHubProjects(params.hub,{},node.forgeCredentials.client3Legged, node.forgeCredentials.internalCredentials)
			.then(function (projects) {
				if (!projects.body.hasOwnProperty('next')) {
          cb(null, projects);
        } else {
          var url_parts = url.parse(projects.body.next, true);
          projects.body.nextKey = url_parts.query.startAt;
          projects.body.limit = url_parts.query.limit;
          //hubs.body.region = params.region;
          cb(null, projects);
        }
			})
			.catch(function (error) {
        console.log('list projects errors');
				cb(error, null);
			});
		//cb(null, params);
  };

  //GET	hubs/:hub_id/projects/:project_id
  //https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-GET/
  service.ProjectDetails = function (n, node, oa2legged, msg, cb) {
		var hubparams = service.HubDetailsParams(n, msg);
    var projectparams = service.ProjectDetailsParams(n,msg);
		var dmproject = new ForgeAPI.ProjectsApi();
    console.log(hubparams.hub)
    console.log(projectparams.project)
		dmproject.getProject(hubparams.hub,projectparams.project, node.forgeCredentials.client3Legged, node.forgeCredentials.internalCredentials)
			.then(function (project) {
				//console.log(JSON.stringify(buckets.body.items, null, 4));
				cb(null, project);
			})
			.catch(function (error) {
				cb(error, null);
			});
		//cb(null, params);
  }; 
  
  //GET	hubs/:hub_id/projects/:project_id/hub
  //https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-hub-GET/
  service.ProjectHubDetails = function (n, node, oa2legged, msg, cb) {
		var hubparams = service.HubDetailsParams(n, msg);
    var projectparams = service.ProjectDetailsParams(n,msg);
		var dmproject = new ForgeAPI.ProjectsApi();
    console.log(hubparams.hub)
    console.log(projectparams.project)
		dmproject.getProjectHub(hubparams.hub,projectparams.project, node.forgeCredentials.client3Legged, node.forgeCredentials.internalCredentials)
			.then(function (project) {
				//console.log(JSON.stringify(buckets.body.items, null, 4));
				cb(null, project);
			})
			.catch(function (error) {
				cb(error, null);
			});
		//cb(null, params);
  }; 

  //GET	hubs/:hub_id/projects/:project_id/topFolders
  //https://forge.autodesk.com/en/docs/data/v2/reference/http/hubs-hub_id-projects-project_id-topFolders-GET/
  service.ListFolders = function (n, node, oa2legged, msg, cb) {
		var hubparams = service.HubDetailsParams(n, msg);
    var projectparams = service.ProjectDetailsParams(n,msg);
    var dmfolder = new ForgeAPI.ProjectsApi(); 
     
		dmfolder.getProjectTopFolders(hubparams.hub,projectparams.project,node.forgeCredentials.client3Legged, node.forgeCredentials.internalCredentials)
			.then(function (folders) {
				if (!folders.body.hasOwnProperty('next')) {
          cb(null, folders);
        } else {
          var url_parts = url.parse(folders.body.next, true);
          folders.body.nextKey = url_parts.query.startAt;
          folders.body.limit = url_parts.query.limit; 
          cb(null, folders);
        }
			})
			.catch(function (error) {
        console.log('list folders errors');
				cb(error, null);
			});
		//cb(null, params);
  };

};
