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

    function ForgeTrafficNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        // Context is necessary to store the node state
        var context = this.context();

        // Changing state function
        this.state = function (passing) {
            // Store the new state
            context.set('pass', passing);

            // Change the circle below to reflect the new state
            if (passing) {
                this.status({
                    fill: 'green',
                    shape: 'dot',
                    text: 'allow'
                });
            } else {
                this.status({
                    fill: 'red',
                    shape: 'dot',
                    text: 'stop'
                });
            }
        }

        // Default state according to the configuration
        this.state(config.default_start);

        // Build 'allow' regex
        var options = (config.ignore_case_allow) ? 'i' : '';
        var rx_allow = null;
        try {
            rx_allow = new RegExp(config.filter_allow, options);
        } catch (exception) {
            node.error(exception);
        }

        // Build 'stop' regex
        var options = (config.ignore_case_stop) ? 'i' : '';
        var rx_stop = null;
        try {
            rx_stop = new RegExp(config.filter_stop, options);
        } catch (exception) {
            node.error(exception);
        }

        // Source: http://stackoverflow.com/questions/6906108/in-javascript-how-can-i-dynamically-get-a-nested-property-of-an-object
        function getPropByString(obj, propString) {
            if (!propString)
                return obj;

            var prop, props = propString.split('.');

            for (var i = 0, iLen = props.length - 1; i < iLen; i++) {
                prop = props[i];

                var candidate = obj[prop];
                if (candidate !== undefined) {
                    obj = candidate;
                } else {
                    break;
                }
            }
            return obj[props[i]];
        }

        // If new message...
        this.on('input', function (msg) {

            var other = true;

            var value = getPropByString(msg, config.property_allow);

            // If value for the 'allow' property for the incoming message has the right 'allow' value ...
            if (rx_allow != null && value !== undefined && !!(rx_allow.test(value) ^ config.negate_allow)) {
                // State is changed to 'allow'
                this.state(true);
                // If needed, also send the input message
                if (config.send_allow) node.send(msg);

                other = false;
            }

            value = getPropByString(msg, config.property_stop);

            // If value for the 'stop' property for the incoming message has the right 'stop' value ...
            if (other && rx_stop != null && value !== undefined && !!(rx_stop.test(value) ^ config.negate_stop)) {
                // State is changed to 'stop'
                this.state(false);
                // If needed, also send the input message
                if (config.send_stop) node.send(msg);

                other = false;
            }

            // Other cases, the message is sent only if in 'allow' state
            if (context.get('pass')) {
                // any stack?
                (context.get('stack') || []).forEach(function (msg) {
                    node.send(msg);
                });
                context.set('stack', []);
                if (other) node.send(msg);
            } else {
                if (other && config.differ) {
                    var store;
                    (store = context.get('stack') || []).push(msg);
                    context.set('stack', store);
                }
            }

        });

    }

    RED.nodes.registerType('forge-traffic', ForgeTrafficNode);
};