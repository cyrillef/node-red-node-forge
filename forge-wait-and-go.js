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

    // Forge
    function ForgeWaitAndGoNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.waitAndGo = n;

        function onInput(msg) {

            if (msg.topic && msg.topic === node.waitAndGo.topic) {
                node.status({});
                if (node.waitAndGoMsgs && node.waitAndGoMsgs.length === 1) {
                    node.send([node.waitAndGoMsgs[0], null]);
                } else if (node.waitAndGoMsgs) {
                    if (node.waitAndGo.combine) {
                        var result = node.waitAndGoMsgs[0];
                        var tmp = result.payload;
                        result.payload = [tmp];
                        for (var i = 1; i < node.waitAndGoMsgs.length; i++)
                            result.payload.push(node.waitAndGoMsgs[i].payload);
                        node.send([result, null]);
                    } else {
                        node.send([node.waitAndGoMsgs, null]);
                    }
                } else {
                    node.status({
                        fill: 'red',
                        shape: 'ring',
                        text: 'error'
                    });
                    //node.error('failed: ' + err.toString(), msg);
                    node.send([null, {
                        err: 'No data'
                    }]);
                    return;
                }
                delete node.waitAndGoMsgs;
            } else {
                node.status({
                    fill: 'yellow',
                    shape: 'dot',
                    text: 'waiting'
                });
                if (!node.waitAndGoMsgs)
                    node.waitAndGoMsgs = [];
                node.waitAndGoMsgs.push(msg);
            }
        }

        node.on('input', onInput);

    }

    RED.nodes.registerType('forge-wait-and-go', ForgeWaitAndGoNode);

};