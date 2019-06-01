module.exports = function(RED) {
    function oauthcredentials(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            msg.payload = node.FORGE_CLIENT_ID;
            node.send(msg);
        });
    }
    RED.nodes.registerType("oauth-credentials",oauthcredentials);
}

