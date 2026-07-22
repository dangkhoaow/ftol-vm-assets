/** Allows to save objects to HTML5 local storage.
 * However, it can only save properties, not functions.
 * FreeToolOnline: keys namespaced ftol:particleclicker:* (shared CDN origin).
 */
var ObjectStorage = (function() {
  'use strict';
  var PREFIX = 'ftol:particleclicker:';
  try {
    var _s = localStorage;
    return {
      save :
          function(key, item) {
            _s.setItem(PREFIX + key, JSON.stringify(item, function(key, val) {
                              if (key == '$$hashKey') {
                                return undefined;
                              }
                              return val;
                            }));
          },
      load : function(key) {
        var raw = _s.getItem(PREFIX + key);
        return raw == null ? null : JSON.parse(raw);
      },
      clear : function() {
        var toRemove = [];
        for (var i = 0; i < _s.length; i++) {
          var k = _s.key(i);
          if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
        }
        for (var j = 0; j < toRemove.length; j++) {
          _s.removeItem(toRemove[j]);
        }
      }
    };
  } catch (e) {
    alert('There is no local storage for you.' +
          ' If you refresh the page, all progress will be lost');
    return {
      save : function(key, item) {},
      load : function(key) { return null; },
      clear : function() {}
    };
  };
}());
