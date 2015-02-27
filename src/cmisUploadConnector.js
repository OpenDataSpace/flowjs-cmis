/**
 * Created by intouch on 2/27/15.
 */
(function(window) {'use strict';

  function CmisUploadConnector(url, username, password) {
    /**
     * CmisJS session object
     * @type {CmisSession}
     */
    this.session = null;

    /**
     * Current folder id
     * @type {string}
     */
    this.currentFolderId = null;

    this.url = url || "http://localhost:81/cmis/browser";
    this.username = username || "philip";
    this.password = password || "111";

    // TODO: this is very very temp solution!!!!!!!
    this.disableHttps = true;
  }

  CmisUploadConnector.prototype = {

    hasActiveSession: function() {
      return !!this.session;
    },

    /**
     * Create CMISJS session
     */
    createSession: function(callback) {
      var session = this.session = cmis.createSession(this.url);
      session.setGlobalHandlers(console.log, console.log);
      session.setCredentials(this.username, this.password).loadRepositories()
        .ok(function () {
          if (this.disableHttps) {    // temp solution - to disable https while testing
            session.defaultRepository.repositoryUrl = session.defaultRepository.repositoryUrl.replace('https://', 'http://');
            session.defaultRepository.rootFolderUrl = session.defaultRepository.rootFolderUrl.replace('https://', 'http://');
          }
          session.getObjectByPath('/').ok(function (data) {
            this.currentFolderId = data.succinctProperties['cmis:objectId'];
            callback();
          }.bind(this));
        }.bind(this));
    },

    /**
     * Create CmisJS document
     * @param flowFile
     * @param parentId
     * @param callback
     */
    createFile: function(flowFile, callback) {
      var documentContent = "";
      var access = {};
      var type = flowFile.type || 'text/plain';
      access[this.username] = ['cmis:read'];
      this.session.createDocument(this.currentFolderId, documentContent, flowFile.name, type, undefined, undefined, access, null, null).ok(function (data) {
        flowFile.cmisId = data.succinctProperties['cmis:objectId'];
        callback(true);
      });
    },

    /**
     * Append File chunk to file
     * @param flowFile
     * @param bytes
     * @returns {CmisRequest}
     */
    appendFileChunk: function(flowFile, bytes) {
      this.session.appendContentStream(flowFile.cmisId, bytes, true).ok(function() {
        console.log('ok');
      });
    }

  };

  if ( typeof module === "object" && module && typeof module.exports === "object" ) {
    // Node module
    module.exports = CmisUploadConnector;
  } else {
    // Otherwise expose Flow to the global object as usual
    window.CmisUploadConnector = CmisUploadConnector;

    // Register as a named AMD module
    if ( typeof define === "function" && define.amd ) {
      define( "CmisUploadConnector", [], function () { return Flow; } );
    }
  }

})(window);