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

	var ForgeAPI = require('forge-apis');

	var localUserCache = {};

	// Forge Config
	function ForgeNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		//this.AppName = n.AppName;
		this.ClientID = this.credentials.ClientID; // || process.env.FORGE_CLIENT_ID; //'${FORGE_CLIENT_ID}';
		this.ClientSecret = this.credentials.ClientSecret; // || process.env.FORGE_CLIENT_SECRET;
		this.CallbackURL = n.CallbackURL; // || process.env.FORGE_CALLBACK;
		try {
			var out ={};
			if (this.payloadType !== 'flow' && this.payloadType !== 'global') {
				this.ClientID = RED.util.evaluateNodeProperty(this.ClientID, this.credentials.ClientIDType, this.credentials, out);
				this.ClientSecret = RED.util.evaluateNodeProperty(this.ClientSecret, this.credentials.ClientSecretType, this.credentials, out);
				this.CallbackURL = RED.util.evaluateNodeProperty(this.CallbackURL, this.credentials.CallbackURLType, this.credentials, out);
			} else {
				RED.util.evaluateNodeProperty(this.ClientID, this.credentials.ClientIDType, this.credentials, out);
				RED.util.evaluateNodeProperty(this.ClientSecret, this.credentials.ClientSecretType, this.credentials, out);
				RED.util.evaluateNodeProperty(this.CallbackURL, this.credentials.CallbackURLType, this.credentials, out);
			}
		} catch (err) {
		}

		this.Scope = n.Scope;
		this.State = n.State;
		this.AccessToken = this.credentials.AccessToken;
		this.proxyRequired = n.proxyRequired;
		this.proxy = n.proxy;

		var self = this;
		if (!this.FORGE) {
			this.FORGE = callOauth2Legged(this.ClientID, this.ClientSecret, this.Scope);
			this.FORGE
				.then((response) => {
					self.FORGE = response;
				})
				.catch((error) => {
					self.FORGE = undefined;
					self.warn('Forge credentials error' + error);
				});
		}
	}

	RED.nodes.registerType('forge-credentials', ForgeNode, {
		credentials: {
			ClientID: {
				type: 'text',
				value: 'FORGE_CLIENT_ID'
			},
			ClientIDType: {
				type: 'text',
				value: 'env'
			},
			ClientSecret: {
				type: 'text',
				value: 'FORGE_CLIENT_SECRET'
			},
			ClientSecretType: {
				type: 'text',
					value: 'env'
			},
			AccessToken: {
				type: 'text'
			}
		}
	});

	function callOauth2Legged(clientId, clientSecret, scope) {
		return (new Promise(function (fulfill, reject) {
			var oa2Legged = new ForgeAPI.AuthClientTwoLegged(clientId, clientSecret, scope, true);
			oa2Legged.authenticate()
				.then(function (credentials) {
					oa2Legged.__credentials = credentials;
					fulfill(oa2Legged);
				})
				.catch(function (error) {
					reject(error);
				});
		}));
	}

};