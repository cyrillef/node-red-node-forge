# Autodesk Forge Node-RED Nodes

[![Node.js](https://img.shields.io/badge/Node.js-8.0.0-blue.svg)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-0.0.1-blue.svg)](https://www.npmjs.com/)
![Platforms](https://img.shields.io/badge/platform-windows%20%7C%20osx%20%7C%20linux-lightgray.svg)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://opensource.org/licenses/MIT)

*Forge API*:
[![oAuth2](https://img.shields.io/badge/oAuth2-v1-green.svg)](http://developer-autodesk.github.io/)
[![OSS](https://img.shields.io/badge/OSS-v2-green.svg)](http://developer-autodesk.github.io/)
[![Data-Management](https://img.shields.io/badge/Data%20Management-v1-green.svg)](http://developer-autodesk.github.io/)
[![Model-Derivative](https://img.shields.io/badge/Model%20Derivative-v2-green.svg)](http://developer-autodesk.github.io/)
[![Design Automation](https://img.shields.io/badge/Design%20Automation-v3-green.svg)](http://developer-autodesk.github.io/)

## Overview

A collection of nodes for [Autodesk Forge API](https://forge.autodesk.com/) running on [Node-RED](http://nodered.org).

![ ](/images/library.png)

where you can create graph like this one

![ ](/images/example.png)

## Installation

All of these nodes are available as individual npm packages. See the list below for the
npm package names, or [search npm](https://www.npmjs.org/search?q=node-red-node-).

This repository acts as an overall store for these nodes - and is not
intended as a way to install them - unless you really do want to modify them.

To install - either use the manage palette option in the editor, or change to your Node-RED user directory.

        cd ~/.node-red
        npm install node-red-node-forge --save

--------

## Developer section only

For Windows - Install all the required tools and configurations using Microsoft's windows-build-tools using npm install --global --production windows-build-tools from an elevated PowerShell or CMD.exe (run as Administrator).

Then

- Clone Node-red repo: ```git clone https://github.com/node-red/node-red.git```
- Clone this repo: ```git clone https://github.com/cyrillef/node-red-node-forge.git```
- ```cd node-red-node-forge```
- Install dependencies ```npm install```
- ```cd ../node-red```
- Install the Forge node in node-red ```npm install ../node-red-node-forge --save```
- Install dependencies ```npm install```
- Start Node-red ```NODE_ENV=development node packages/node_modules/node-red/red.js --userDir ~/my-configs/node-red```

### Usage

- Open your favorite Browser and navigate to ```http://localhost:1880/```
- Import any of the Forge node-red examples
- Setup the credential nodes as needed

--------

## License

This sample is licensed under the terms of the [MIT License](http://opensource.org/licenses/MIT).
Please see the [LICENSE](LICENSE) file for full details.

## Written by

Cyrille Fauvel  
Forge Partner Development  
[http://developer.autodesk.com/](http://developer.autodesk.com/)  
[http://around-the-corner.typepad.com](http://around-the-corner.typepad.com)
