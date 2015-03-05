(function(window) {'use strict';

  function FakeCmisConnector(url, username, password) {
    this.session = null;

    /**
     * Array with fake callbacks
     */
    this.fakeAppendCallbacks = [];
  }
  FakeCmisConnector.prototype = {

    callFakeAppendCallback: function(status) {
      var callback = this.fakeAppendCallbacks.shift();
      callback.call(null, status || "success", {});
    },

    hasActiveSession: function() {
      return !!this.session;
    },

    createSession: function(callbackOk) {
      this.session = {};
      setTimeout(function() {
        callbackOk();
      }, 10);
    },

    createFile: function(flowFile, chunkContent, callback) {
      flowFile.cmisId = '2423423432';
      this.fakeAppendCallbacks.push(callback);
      setTimeout(function() {
        callback.call(null, 'success', {});
      }, 500);
    },

    appendFileChunk: function(flowChunk, chunkContent, isLastChunk, callback) {
      this.fakeAppendCallbacks.push(callback);
      setTimeout(function() {
        callback.call(null, 'success', {});
      }, 500);
    },

    resetFileContent: function(flowFile, callback) {
      setTimeout(function() {
        callback.call(null, 'success');
      }, 10);
    }
  };

  window.FakeCmisConnector = FakeCmisConnector;

})(window);