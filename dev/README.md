
## Instructions / Notes for developers

### Example of setting up your sources on OSX

[source file](setup)

### Writing a new Node

A Node-RED node is composed of 2 components:

- the UI component used in the UI / Editor
- the executing component running on the server

Note the actual node code executes only on the server, the UI/Editor node part is only to represent your node, connections, etc... in the Visual Programming editor, but do not run any code logic.


#### The WEB Browser / Editor node component

[forge-wait-and-go.html](../forge-wait-and-go.html#L24) is where you define the UI for the parameters' panel. It really consist of rows of control.

[forge-wait-and-go.html](../forge-wait-and-go.html#L42) is where you register your node, and define default values for all the parameters.

[forge-wait-and-go.html](../forge-wait-and-go.html#L60) the label() function is to display text on the flow graph representation.

Other functions could be:

	// oneditprepare is called immediately before the dialog is displayed.
	// oneditsave is called when the edit dialog is okayed.
	// oneditcancel is called when the edit dialog is cancelled.
	// oneditdelete is called when the delete button in a configuration node’s edit dialog is pressed.
	// oneditresize is called when the edit dialog is resized.

There is a special control available: typedInput, which can handle special treatment 'flow', 'global', 'str', 'env', ...

#### The executing Node-RED node

[forge-wait-and-go.js](../forge-wait-and-go.js#L76) is where you register your node, and the callback function to create instance of your node when flow are executed.

[forge-wait-and-go.js](../forge-wait-and-go.js#L25) is the callback function mentioned above.

[forge-wait-and-go.js](../forge-wait-and-go.js#L26) instanciate a node.

```RED.nodes.getNode(n.forge);``` would gave you access to the instance' parameters.

[forge-wait-and-go.js](../forge-wait-and-go.js#L72) is where you register a callback for anytime there is a value coming in your instance node.

[forge-wait-and-go.js](../forge-wait-and-go.js#L43) is where you return the result after running your instance code / parameter.

#### Registering your node in Node-RED

This is done in your [package.json](../package.json#L24) file. What is important is that the names used in the ```RED.nodes.registerType()``` calls in the html and js files must all match with the one used here.

#### Localization principles

Mainly for the UI component and is a set of 2 files [in this folder](../locales/en-US)

- the [html file](../locales/en-US/forge-wait-and-go.html) is used to display information about the node in the editor.

- the [json file](../locales/en-US/forge-wait-and-go.json) is the catalog of UI messages / labels for controls, etc... It use the i18n library to render the messages in the UI.

### VS Code configuratio example

```
{
	"name": "Launch Program",
	"type": "node",
	"request": "launch",
	"cwd": "${workspaceFolder}/../node-red",
	"program": "${workspaceFolder}/../node-red/packages/node_modules/node-red/red.js",
	//"port": 9229,
	// "runtimeArgs": [
	//     "--preserve-symlinks"
	// ],
	"args": [
		"--userDir", "~/Projects/node-red/cyrille"
	],
	"env": {
		"NODE_ENV": "development"
		//"FORGE_CLIENT_ID": "cyrille-noderd-test2"
	}
}
```

## Additional material

There is a video available [here](.) which goes thought the POC / concept implementation.