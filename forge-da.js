module.exports = function(RED) {
  "use strict";
  var url = require("url");
  var fs = require("fs");
  var uuidv4 = require("uuid/v4");
  var streamBuffers = require("stream-buffers");
  var ForgeAPI = require("forge-apis");
  const {
    DesignAutomationClient,
    DesignAutomationID
  } = require("forge-server-utils");

  // Forge
  function ForgeDANode(n) {
    RED.nodes.createNode(this, n);
    this.forgeCredentials = RED.nodes.getNode(n.forge);

    this.daProperties = n;
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
          msgErr.err.op = "oss:" + node.daProperties.operation;
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

      if (typeof service[node.daProperties.operation] === "function") {
        node.status({
          fill: "blue",
          shape: "dot",
          text: node.daProperties.operation
        });
        service[node.daProperties.operation](n, node, FORGE, msg, _cb);
      } else {
        node.error(
          RED._("forge.error.unknown-operation", {
            op: node.daProperties.operation
          })
        );
      }
    }

    node.on("input", onInput);
  }

  RED.nodes.registerType("forge-da", ForgeDANode);

  var service = {};

  service.ListEngines = function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    client
      .listEngines()
      .then(function(engines) {
        cb(null, engines);
      })
      .catch(function(error) {
        cb(error, null);
      });
  };

  service.GetEngine = function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });

    client
      .getEngine(n.engine)
      .then(function(details) {
        cb(null, details);
      })
      .catch(function(error) {
        cb(error, null);
      });
  };

  service.ListAppbundles = function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    client
      .listAppBundles()
      .then(function(details) {
        cb(null, details);
      })
      .catch(function(error) {
        cb(error, null);
      });
  };

  service.GetAppbundle = function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });

    const designAutomationId = new DesignAutomationID(
      oa2legged.clientId,
      n.bundleId,
      n.bundleAlias
    );
    let qualifiedId = designAutomationId.toString();

    client
      .getAppBundle(qualifiedId)
      .then(function(details) {
        cb(null, details);
      })
      .catch(function(error) {
        cb(error, null);
      });
  };
};
