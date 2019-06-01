module.exports = function(RED) {
    function oauth2legged(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            msg.payload = msg.payload.toLowerCase();
            node.send(msg);
        });
    }
    RED.nodes.registerType("oauth-2legged",oauth2legged);
}

