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
	const utils = require('./utils');

	// Forge
	function ForgeTokenNode(n) {
		RED.nodes.createNode(this, n);
		this.forgeCredentials = RED.nodes.getNode(n.forge);
		this.tokenProperties = n;
		var node = this;

		async function onInput(msg) {
			var FORGE = node.forgeCredentials ? node.forgeCredentials.FORGE : null;
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

			if ( typeof msg.payload !== 'object' )
				msg.payload = {};
			FORGE = await FORGE;
			msg.payload.token = FORGE.getCredentials();
			node.status({});
			msg.topic = node.tokenProperties.topic || node.topic;
			node.send([msg, null]);
		}

		node.on('input', onInput);
	}

	RED.nodes.registerType('forge-get-token', ForgeTokenNode);
};