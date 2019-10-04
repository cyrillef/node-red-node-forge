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
    function ForgeDMNode(n) {
        RED.nodes.createNode(this, n);
        this.forgeCredentials = RED.nodes.getNode(n.forge);
        this.dmProperties = n;
        var node = this;

        function onInput(msg) {

			if ( msg.nodeFlowId ) {
				var flowNode = RED.nodes.getNode(msg.nodeFlowId);
				if (flowNode) {
					msg.flowid =flowNode.z;
					delete msg.nodeFlowId;
				}
			}

			//var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
			var FORGE = node.forgeCredentials;
			//RED.nodes.getNode('forge-credentials');
			if (!FORGE) {
				if (node._forgeCredentials) {
					delete node._forgeCredentials;
					node.warn(RED._('forge.warn.missing-credentials'));
					return;
				}
				node._forgeCredentials = true;
				var forgeDefaultCredentials = null;
				RED.nodes.eachNode((elt) => { // elt.type === 'forge-*'
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
                    msgErr.err.op = 'oss:' + node.dmProperties.operation;
                    node.send([null, msgErr]);
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

            if (typeof service[node.dmProperties.operation] === 'function') {
                node.status({
                    fill: 'blue',
                    shape: 'dot',
                    text: node.dmProperties.operation
                });
                service[node.dmProperties.operation](n, node, FORGE, msg, _cb);
            } else {
                node.error(RED._('forge.error.unknown-operation', {
                    op: node.dmProperties.operation
                }));
            }

        }

        node.on('input', onInput);

    }

	RED.nodes.registerType('forge-commands', ForgeDMNode);

	var service = {};
	service.ListHubs = function(n, node, FORGE, msg, cb){

		var dmHubs = new ForgeAPI.HubsApi();		
		try{
		dmHubs.getHubs({},FORGE.client3Legged,FORGE.internalCredentials)
		.then(function(hubs){
			//console.log(JSON.stringify(hubs.body.items, null, 4));
			if (!hubs.body.hasOwnProperty('next')) {
				cb(null, hubs);
			} else {
				var url_parts = url.parse(hubs.body.next, true);
				hubs.body.nextKey = url_parts.query.startAt;
				hubs.body.limit = url_parts.query.limit;
				cb(null, hubs);
			}
		})
		.catch(function(error){
			console.log('list hub errors');
			cb(error,null);
		});	
	}
	catch (ex) {
		console.log(ex);
	}

	};
	// service.ListHubs = function(n,node,FORGE,msg,cb){

	// 	var dmHubs = new ForgeAPI.HubsApi();		
	// 	dmHubs.getHubs({},FORGE.credentials.access_token,FORGE.credentials)
	// 	.then(function(hubs){
	// 		//console.log(JSON.stringify(hubs.body.items, null, 4));
	// 		if (!hubs.body.hasOwnProperty('next')) {
	// 			cb(null, hubs);
	// 		} else {
	// 			var url_parts = url.parse(hubs.body.next, true);
	// 			hubs.body.nextKey = url_parts.query.startAt;
	// 			hubs.body.limit = url_parts.query.limit;
	// 			//hubs.body.region = params.region;
	// 			cb(null, hubs);
	// 		}
	// 	})
	// 	.catch(function(error){
	// 		console.log('list hub errors');
	// 		cb(error,null);
	// 	});	
	// //   }
	// };
};