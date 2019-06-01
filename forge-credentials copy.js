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

    // Forge out
    function ForgeOutNode(n) {
        RED.nodes.createNode(this, n);
        this.forgeConfig = RED.nodes.getNode(n.forge);

        var node = this;
        var FORGE = this.forgeConfig ? this.forgeConfig.FORGE : null;

        if (!FORGE) {
            node.warn(RED._("forge.warn.missing-credentials"));
            return;
        }
    }

    RED.nodes.registerType("forge credentials out", ForgeOutNode);

    // Forge Config
    function ForgeNode(n) {
        RED.nodes.createNode(this, n);
        if (this.credentials &&
            this.credentials.accesskeyid &&
            this.credentials.secretaccesskey
        ) {
            //this.AWS = require("aws-sdk");
            // this.AWS.config.update({
            //     accessKeyId: this.credentials.accesskeyid,
            //     secretAccessKey: this.credentials.secretaccesskey,
            // });
        }
    }

    RED.nodes.registerType("forge-config", ForgeNode, {
        credentials: {
            accesskeyid: {
                type: "text"
            },
            secretaccesskey: {
                type: "password"
            }
        }
    });

};