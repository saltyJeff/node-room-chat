var defaults = require("./default.js");
var custom = require("./custom.js");
module.exports = function (prop) {
    return customs[prop] || defaults[prop];
};