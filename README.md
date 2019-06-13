**This is work in progress and the readme below does not yet reflect its final state. For example the NPM information is not yet working.**

[![Node.js](https://img.shields.io/badge/Node.js-6.3.1-blue.svg)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-0.0.1-blue.svg)](https://www.npmjs.com/)
![Platforms](https://img.shields.io/badge/platform-windows%20%7C%20osx%20%7C%20linux-lightgray.svg)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://opensource.org/licenses/MIT)

*Forge API*:
[![oAuth2](https://img.shields.io/badge/oAuth2-v1-green.svg)](http://developer-autodesk.github.io/)
[![OSS](https://img.shields.io/badge/OSS-v2-green.svg)](http://developer-autodesk.github.io/)
[![Model-Derivative](https://img.shields.io/badge/Model%20Derivative-v2-green.svg)](http://developer-autodesk.github.io/)


# Autodesk Forge Node-RED Nodes

A collection of nodes for [Autodesk Forge API](https://forge.autodesk.com/) ruuning on [Node-RED](http://nodered.org). See below for a list.

## Installation

All of these nodes are available as individual npm packages. See the list below for the
npm package names, or [search npm](https://www.npmjs.org/search?q=node-red-node-).

This repository acts as an overall store for these nodes - and is not
intended as a way to install them - unless you really do want some development.

To install - either use the manage palette option in the editor, or change to your Node-RED user directory.

        cd ~/.node-red
        npm install node-red-node-forge

## Running Tests

Node.js v6 or newer is required. To run tests on all of the nodes you will need the node-red runtime:

    npm i node-red-nodes
    npm test

--------

## Developer section

- Clone Node-red repo: ```git clone https://github.com/node-red/node-red.git```
- Clone this repo: ```git clone https://github.com/cyrillef/node-red-node-forge.git```
- ```cd node-red```
- Install the Forge node in node-red ```npm install ../node-red-node-forge```
- Install dependencies ```npm install```
- ```NODE_EN=development node packages/node_modules/node-red/red.js --userDir ~/my-configs/node-red```

### Usage

tbd

--------

## License

This sample is licensed under the terms of the [MIT License](http://opensource.org/licenses/MIT).
Please see the [LICENSE](LICENSE) file for full details.

While the sample is licensed under the terms of the MIT license, the content people post on this site and the bubbles you
can extract remain the property of their owner. For a good customer experience the resulting ZIP file includes
the current version of the viewer, but the intellectual property of this component remains Autodesk's.
You can freely use it for offline viewing on your device, and/or use it on you website, but you cannot claim
it to be yours.

## Written by

Cyrille Fauvel <br />
Forge Partner Development <br />
http://developer.autodesk.com/ <br />
http://around-the-corner.typepad.com <br />