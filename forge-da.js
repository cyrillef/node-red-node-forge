module.exports = function(RED) {
  "use strict";
  const fs = require("fs");
  const FormData = require("form-data");
  const path = require("path");

  const {
    DesignAutomationClient,
    DesignAutomationID,
    DataManagementClient
  } = require("forge-server-utils");

  //Utils:
  function uploadAppBundleFile(appBundle, appBundleFilename) {
    const uploadParameters = appBundle.uploadParameters.formData;
    const form = new FormData();
    form.append("key", uploadParameters["key"]);
    form.append("policy", uploadParameters["policy"]);
    form.append("content-type", uploadParameters["content-type"]);
    form.append(
      "success_action_status",
      uploadParameters["success_action_status"]
    );
    form.append(
      "success_action_redirect",
      uploadParameters["success_action_redirect"]
    );
    form.append("x-amz-signature", uploadParameters["x-amz-signature"]);
    form.append("x-amz-credential", uploadParameters["x-amz-credential"]);
    form.append("x-amz-algorithm", uploadParameters["x-amz-algorithm"]);
    form.append("x-amz-date", uploadParameters["x-amz-date"]);
    form.append(
      "x-amz-server-side-encryption",
      uploadParameters["x-amz-server-side-encryption"]
    );
    form.append(
      "x-amz-security-token",
      uploadParameters["x-amz-security-token"]
    );
    form.append("file", fs.createReadStream(appBundleFilename));
    return new Promise(function(resolve, reject) {
      form.submit(appBundle.uploadParameters.endpointURL, function(err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  function sleep(ms) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        resolve();
      }, ms);
    });
  }

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

  service.ListEngines = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let engines = await client.listEngines();
      cb(null, engines);
    } catch (error) {
      cb(error, null);
    }
  };

  service.GetEngine = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let details = await client.getEngine(n.engine);
      cb(null, details);
    } catch (error) {
      cb(error, null);
    }
  };

  service.ListAppbundles = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let details = await client.listAppBundles();
      cb(null, details);
    } catch (error) {
      cb(error, null);
    }
  };

  service.GetAppbundle = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });

    const designAutomationId = new DesignAutomationID(
      oa2legged.clientId,
      n.bundleId,
      n.bundleAlias
    );
    let qualifiedId = designAutomationId.toString();

    try {
      let details = await client.getAppBundle(qualifiedId);
      cb(null, details);
    } catch (error) {
      cb(error, null);
    }
  };

  service.CreateOrUpdateAppbundle = async function(
    n,
    node,
    oa2legged,
    msg,
    cb
  ) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });

    const APPBUNDLE_NAME = n.bundleId;
    const APPBUNDLE_ALIAS = n.bundleAlias;
    const APPBUNDLE_ENGINE = n.engine;
    let APPBUNDLE_FILE = n.bundleFile;
    const APPBUNDLE_DESCRIPTIION = n.bundleDesc;
    const allAppBundles = await client.listAppBundles();
    const matchingAppBundles = allAppBundles.filter(
      item => item.indexOf(APPBUNDLE_NAME) !== -1
    );
    let appBundle;
    try {
      if (matchingAppBundles.length === 0) {
        appBundle = await client.createAppBundle(
          APPBUNDLE_NAME,
          APPBUNDLE_ENGINE,
          APPBUNDLE_DESCRIPTIION
        );
      } else {
        appBundle = await client.updateAppBundle(
          APPBUNDLE_NAME,
          APPBUNDLE_ENGINE,
          APPBUNDLE_DESCRIPTIION
        );
      }
      cb(null, appBundle);
    } catch (err) {
      cb(err, null);
    }

    // Upload appbundle zip file
    try {
      var file = path.normalize(APPBUNDLE_FILE);
      if (!path.isAbsolute(APPBUNDLE_FILE)) {
        node.error("Absolute Path Required");
        return;
      }
      var res = await uploadAppBundleFile(appBundle, file);
      cb(null, `File Upload is ${res.statusMessage} and ${res.statusCode}`);
    } catch (err) {
      cb(err, null);
    }

    // Create or update an appbundle alias
    const allAppBundleAliases = await client.listAppBundleAliases(
      APPBUNDLE_NAME
    );
    const matchingAppBundleAliases = allAppBundleAliases.filter(
      item => item.id === APPBUNDLE_ALIAS
    );
    let appBundleAlias;
    try {
      if (matchingAppBundleAliases.length === 0) {
        appBundleAlias = await client.createAppBundleAlias(
          APPBUNDLE_NAME,
          APPBUNDLE_ALIAS,
          appBundle.version
        );
      } else {
        appBundleAlias = await client.updateAppBundleAlias(
          APPBUNDLE_NAME,
          APPBUNDLE_ALIAS,
          appBundle.version
        );
      }
    } catch (err) {
      //.error('Could not create or update appbundle alias', err);
      cb(err, null);
    }
    // console.log('AppBundle alias', appBundleAlias);
    cb(null, appBundleAlias);
  };

  service.ListAppbundleVersions = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let versions = await client.listAppBundleVersions(n.bundleId);
      cb(null, versions);
    } catch (err) {
      cb(err, null);
    }
  };

  service.ListAppbundleAliases = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let aliases = await client.listAppBundleAliases(n.bundleId);
      cb(null, Object.assign({}, aliases));
    } catch (error) {
      cb(error, null);
    }
  };

  service.DeleteAppbundle = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let res = await client.deleteAppBundle(n.bundleId);
      cb(null, res);
    } catch (error) {
      cb(error, null);
    }
  };

  service.DeleteAppbundleAlias = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let res = await client.deleteAppBundleAlias(n.bundleId, n.bundleAlias);
      cb(null, res);
    } catch (error) {
      cb(error, null);
    }
  };
  service.DeleteAppbundleVersion = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let res = await client.deleteAppBundleVersion(
        n.bundleId,
        n.bundleVersion
      );
      cb(null, res);
    } catch (error) {
      cb(error, null);
    }
  };
  service.ListActivities = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let activities = await client.listActivities();
      cb(null, activities);
    } catch (error) {
      cb(error, null);
    }
  };

  service.ListActivityAliases = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    let activityShortId = n.activityId;
    try {
      let aliasDetails = await client.listActivityAliases(activityShortId);
      cb(null, aliasDetails);
    } catch (error) {
      cb(error, null);
    }
  };

  service.ListActivityVersions = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    try {
      let versionDetail = await client.listActivityVersions(n.activityId);
      cb(null, versionDetail);
    } catch (error) {
      cb(error, null);
    }
  };

  service.GetActivity = async function(n, node, oa2legged, msg, cb) {
    const client = new DesignAutomationClient({
      token: oa2legged.credentials.access_token
    });
    const designAutomationId = new DesignAutomationID(
      oa2legged.clientId,
      n.activityId,
      n.activityAlias
    );
    let qualifiedId = designAutomationId.toString();

    //I should find better way to distinguish from function input payload from that of inject input
    if (msg.hasOwnProperty("payload") && typeof msg.payload == "object") {
      qualifiedId = msg.payload;
    }
    try {
      let activityDetail = await client.getActivity(qualifiedId);
      cb(null, activityDetail);
    } catch (error) {
      cb(error, null);
    }
  };

  service.CreateorUpdateActivity = async function(n, node, oa2legged, msg, cb) {
    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    const ACTIVITY_NAME = n.activityId;
    const ACTIVITY_DESCRIPTION = n.activityDesc;
    const ACTIVITY_ALIAS = n.activityAlias;
    const APPBUNDLE_NAME = n.bundleId;
    const APPBUNDLE_ALIAS = n.bundleAlias;
    const APPBUNDLE_ENGINE = n.engine;
    const allActivities = await client.listActivities();
    const matchingActivities = allActivities.filter(
      item => item.indexOf("." + ACTIVITY_NAME + "+") !== -1
    );
    let activityInputs = [
      {
        name: "inputFile",
        description: "Host Drawing",
        zip: false,
        ondemand: false,
        verb: "get",
        localName: "$(inputFile)"
      },
      {
        name: "inputJson",
        description: "input json",
        zip: false,
        ondemand: false,
        verb: "get",
        localName: "params.json"
      }
    ];
    let activityOutputs = [
      {
        name: "outputFile",
        description: "output file",
        zip: false,
        ondemand: false,
        verb: "put",
        localName: "outputFile.dwg",
        required: true
      }
    ];
    let script = "UpdateParam\n";
    if (msg.hasOwnProperty("payload") && typeof msg.payload !== "undefined") {
      if (msg.payload.activityInputs) {
        activityInputs = msg.payload.activityInputs;
      }
      if (msg.payload.activityOutputs) {
        activityOutputs = msg.payload.activityOutputs;
      }
      if (msg.payload.script) {
        script = msg.payload.script;
      }
    }
    let activity;
    try {
      if (matchingActivities.length === 0) {
        activity = await client.createActivity(
          ACTIVITY_NAME,
          ACTIVITY_DESCRIPTION,
          APPBUNDLE_NAME,
          APPBUNDLE_ALIAS,
          APPBUNDLE_ENGINE,
          activityInputs,
          activityOutputs,
          script
        );
      } else {
        activity = await client.updateActivity(
          ACTIVITY_NAME,
          ACTIVITY_DESCRIPTION,
          APPBUNDLE_NAME,
          APPBUNDLE_ALIAS,
          APPBUNDLE_ENGINE,
          activityInputs,
          activityOutputs,
          script
        );
      }
    } catch (err) {
      cb("Could not create or update activity", null);
    }
    cb(null, activity);

    // Create or update an activity alias
    const allActivityAliases = await client.listActivityAliases(ACTIVITY_NAME);
    const matchingActivityAliases = allActivityAliases.filter(
      item => item.id === ACTIVITY_ALIAS
    );
    let activityAlias;
    try {
      if (matchingActivityAliases.length === 0) {
        activityAlias = await client.createActivityAlias(
          ACTIVITY_NAME,
          ACTIVITY_ALIAS,
          activity.version
        );
      } else {
        activityAlias = await client.updateActivityAlias(
          ACTIVITY_NAME,
          ACTIVITY_ALIAS,
          activity.version
        );
      }
    } catch (err) {
      cb("Could not create or update activity alias", null);
    }
    cb(null, activityAlias);
  };

  service.CreateOrUpdateActivityAlias = async function(
    n,
    node,
    oa2legged,
    _msg,
    cb
  ) {
    const ACTIVITY_NAME = n.activityId;
    const ACTIVITY_ALIAS = n.activityAlias;
    const ACTIVITY_VERSION = n.activityVersion;
    // Create or update an activity alias
    const allActivityAliases = await client.listActivityAliases(ACTIVITY_NAME);
    const matchingActivityAliases = allActivityAliases.filter(
      item => item.id === ACTIVITY_ALIAS
    );
    let activityAlias;
    try {
      if (matchingActivityAliases.length === 0) {
        activityAlias = await client.createActivityAlias(
          ACTIVITY_NAME,
          ACTIVITY_ALIAS,
          ACTIVITY_VERSION
        );
      } else {
        activityAlias = await client.updateActivityAlias(
          ACTIVITY_NAME,
          ACTIVITY_ALIAS,
          ACTIVITY_VERSION
        );
      }
    } catch (err) {
      cb("Could not create or update activity alias", null);
    }
    cb(null, activityAlias);
  };

  service.CreateWorkitem = async function(n, node, oa2legged, _msg, cb) {
    const FORGE_BUCKET = n.bucket;
    const INPUT_FILE_PATH = n.inputFile;
    const INPUT_OBJECT_KEY = n.inputObjectKey;
    const OUTPUT_OBJECT_KEY = n.outputObjectKey;

    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    // Create bucket if it doesn't exist
    const dm = new DataManagementClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    const allBuckets = await dm.listBuckets();
    console.log(allBuckets);
    const matchingBuckets = allBuckets.filter(
      item => item.bucketKey === FORGE_BUCKET
    );
    if (matchingBuckets.length === 0) {
      try {
        let bucketDetail = await dm.createBucket(FORGE_BUCKET, "persistent");
        cb(null, bucketDetail);
      } catch (err) {
        cb("Could not create bucket", null);
      }
    }

    // Upload Drawing file and create a placeholder for the output result drawing file
    const inputObjectBuff = fs.readFileSync(INPUT_FILE_PATH);
    try {
      let objectDetail = await dm.uploadObject(
        FORGE_BUCKET,
        INPUT_OBJECT_KEY,
        "application/octet-stream",
        inputObjectBuff
      );
      cb(null, objectDetail);
    } catch (err) {
      cb("Could not upload input file", null);
    }

    // Generate signed URLs for all input and output files
    let inputFileSignedUrl;
    let outputSignedUrl;
    try {
      inputFileSignedUrl = await dm.createSignedUrl(
        FORGE_BUCKET,
        INPUT_OBJECT_KEY,
        "read"
      );
      outputSignedUrl = await dm.createSignedUrl(
        FORGE_BUCKET,
        OUTPUT_OBJECT_KEY,
        "readwrite"
      );
    } catch (err) {
      console.error("Could not generate signed URLs", err);
      process.exit(1);
    }

    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    // Create work item and poll the results
    const activityId = new DesignAutomationID(
      oa2legged.clientId,
      n.activityId,
      n.activityAlias
    );
    let workitemInputs = [
      { name: "inputFile", url: inputFileSignedUrl.signedUrl },
      {
        name: "inputJson",
        url: 'data:application/json,{"Width":"40","Height":"80"}'
      }
    ];
    let workitemOutputs = [
      { name: "outputFile", url: outputSignedUrl.signedUrl }
    ];

    let workitem;
    try {
      workitem = await client.createWorkItem(
        activityId.toString(),
        workitemInputs,
        workitemOutputs
      );
      console.log("Workitem", workitem);
      while (
        workitem.status === "inprogress" ||
        workitem.status === "pending"
      ) {
        await sleep(5000);
        workitem = await client.workItemDetails(workitem.id);
        workitem.outputSignedUrl = outputSignedUrl.signedUrl;
        cb(null, workitem);
      }
    } catch (err) {
      cb(err.stack, null);
    }
  };

  service.GetWorkitem = async function(n, node, oa2legged, _msg, cb) {
    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    let workitem;
    try {
      workitem = await client.workItemDetails(n.workitemId);
      cb(null, workitem);
    } catch (error) {
      cb(error.stack, null);
    }
  };

  service.DeleteActivity = async function(n, node, oa2legged, _msg, cb) {
    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    let details;
    try {
      details = await client.deleteActivity(n.activityId);
      cb(null, details);
    } catch (error) {
      cb(error.stack, null);
    }
  };

  service.DeleteActivityAlias = async function(n, node, oa2legged, _msg, cb) {
    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    let details;
    try {
      details = await client.deleteActivityAlias(n.activityId, n.activityAlias);
      cb(null, details);
    } catch (error) {
      cb(error.stack, null);
    }
  };

  service.DeleteActivityVersion = async function(n, node, oa2legged, _msg, cb) {
    const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
    const client = new DesignAutomationClient({
      client_id: FORGE_CLIENT_ID,
      client_secret: FORGE_CLIENT_SECRET
    });
    let details;
    try {
      details = await client.deleteActivityVersion(
        n.activityId,
        n.activityVersion
      );
      cb(null, details);
    } catch (error) {
      cb(error.stack, null);
    }
  };
};
