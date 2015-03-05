describe('add single file', function() {
  /**
   * @type {Flow}
   */
  var flow;

  beforeEach(function () {
    flow = new Flow({
      generateUniqueIdentifier: function (file) {
        return file.size;
      },
      singleFile: true,
      cmisConnector: new window.FakeCmisConnector()
    });

    var done = false;
    function createSession(){
      flow.cmisConnector.createSession(function() {
        done = true;
      });
    }
    runs(createSession);
    waitsFor(function(){
      return done;
    });
  });

  it('should add single file', function() {
    flow.addFile(new Blob(['file part']));
    expect(flow.files.length).toBe(1);
    var file = flow.files[0];
    flow.upload();
    expect(file.isUploading()).toBeTruthy();
    flow.addFile(new Blob(['file part 2']));
    expect(flow.files.length).toBe(1);
    file = flow.files[0];
    expect(file.isUploading()).toBeFalsy();
  });
});