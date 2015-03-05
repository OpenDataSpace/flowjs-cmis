describe('upload file', function() {
  /**
   * @type {Flow}
   */
  var flow;

  /**
   * @type {FakeCmisConnector}
   */
  var fakeCmisConnector;

  beforeEach(function () {
    fakeCmisConnector = new window.FakeCmisConnector();
    flow = new Flow({
      progressCallbacksInterval: 0,
      generateUniqueIdentifier: function (file) {
        return file.size;
      },
      cmisConnector: fakeCmisConnector
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

  it('should track file upload status with lots of chunks', function() {
    flow.opts.chunkSize = 1;
    flow.addFile(new Blob(['IIIIIIIIII']));
    var file = flow.files[0];
    expect(file.chunks.length).toBe(10);
    flow.upload();
    expect(file.progress()).toBe(0);
    for (var i = 0; i < 9; i++) {
      expect(file.isComplete()).toBeFalsy();
      expect(file.isUploading()).toBeTruthy();
      fakeCmisConnector.callFakeAppendCallback('success');
      expect(file.progress()).toBe((i+1) / 10);
      expect(file.isComplete()).toBeFalsy();
      expect(file.isUploading()).toBeTruthy();
    }
    expect(file.isComplete()).toBeFalsy();
    expect(file.isUploading()).toBeTruthy();
    expect(file.progress()).toBe(0.9);
    fakeCmisConnector.callFakeAppendCallback('success');
    expect(file.isComplete()).toBeTruthy();
    expect(file.isUploading()).toBeFalsy();
    expect(file.progress()).toBe(1);
    expect(flow.progress()).toBe(1);
  });

  it('should throw expected events', function () {
    jasmine.Clock.useMock();
    var events = [];
    flow.on('catchAll', function (event) {
      events.push(event);
    });
    flow.opts.chunkSize = 1;
    flow.addFile(new Blob(['12']));
    var file = flow.files[0];
    expect(file.chunks.length).toBe(2);
    flow.upload();
    // Sync events
    expect(events.length).toBe(4);
    expect(events[0]).toBe('fileAdded');
    expect(events[1]).toBe('filesAdded');
    expect(events[2]).toBe('filesSubmitted');
    expect(events[3]).toBe('uploadStart');
    // Async
    fakeCmisConnector.callFakeAppendCallback('success');
    expect(events.length).toBe(6);
    expect(events[4]).toBe('fileProgress');
    expect(events[5]).toBe('progress');
    fakeCmisConnector.callFakeAppendCallback('success');
    expect(events.length).toBe(9);
    expect(events[6]).toBe('fileProgress');
    expect(events[7]).toBe('progress');
    expect(events[8]).toBe('fileSuccess');

    jasmine.Clock.tick(1);
    expect(events.length).toBe(10);
    expect(events[9]).toBe('complete');

    flow.upload();
    expect(events.length).toBe(11);
    expect(events[10]).toBe('uploadStart');

    // complete event is always asynchronous
    jasmine.Clock.tick(1);
    expect(events.length).toBe(12);
    expect(events[11]).toBe('complete');
  });

  xit('should pause and resume file', function () {
    flow.opts.chunkSize = 1;
    flow.opts.simultaneousUploads = 2;
    flow.addFile(new Blob(['1234']));
    flow.addFile(new Blob(['56']));
    var files = flow.files;
    expect(files[0].chunks.length).toBe(4);
    expect(files[1].chunks.length).toBe(2);
    flow.upload();
    expect(files[0].isUploading()).toBeTruthy();
    expect(requests.length).toBe(2);
    expect(requests[0].aborted).toBeUndefined();
    expect(requests[1].aborted).toBeUndefined();
    // should start upload second file
    files[0].pause();
    expect(files[0].isUploading()).toBeFalsy();
    expect(files[1].isUploading()).toBeTruthy();
    expect(requests.length).toBe(4);
    expect(requests[0].aborted).toBeTruthy();
    expect(requests[1].aborted).toBeTruthy();
    expect(requests[2].aborted).toBeUndefined();
    expect(requests[3].aborted).toBeUndefined();
    // Should resume file after second file chunks is uploaded
    files[0].resume();
    expect(files[0].isUploading()).toBeFalsy();
    expect(requests.length).toBe(4);
    requests[2].respond(200);// second file chunk
    expect(files[0].isUploading()).toBeTruthy();
    expect(files[1].isUploading()).toBeTruthy();
    expect(requests.length).toBe(5);
    requests[3].respond(200); // second file chunk
    expect(requests.length).toBe(6);
    expect(files[0].isUploading()).toBeTruthy();
    expect(files[1].isUploading()).toBeFalsy();
    expect(files[1].isComplete()).toBeTruthy();
    requests[4].respond(200);
    expect(requests.length).toBe(7);
    requests[5].respond(200);
    expect(requests.length).toBe(8);
    requests[6].respond(200);
    expect(requests.length).toBe(8);
    requests[7].respond(200);
    expect(requests.length).toBe(8);
    // Upload finished
    expect(files[0].isUploading()).toBeFalsy();
    expect(files[0].isComplete()).toBeTruthy();
    expect(files[0].progress()).toBe(1);
    expect(files[1].isUploading()).toBeFalsy();
    expect(files[1].isComplete()).toBeTruthy();
    expect(files[1].progress()).toBe(1);
    expect(flow.progress()).toBe(1);
  });

  xit('should retry file', function () {
    flow.opts.testChunks = false;
    flow.opts.chunkSize = 1;
    flow.opts.simultaneousUploads = 1;
    flow.opts.maxChunkRetries = 1;
    flow.opts.permanentErrors = [500];
    var error = jasmine.createSpy('error');
    var progress = jasmine.createSpy('progress');
    var success = jasmine.createSpy('success');
    var retry = jasmine.createSpy('retry');
    flow.on('fileError', error);
    flow.on('fileProgress', progress);
    flow.on('fileSuccess', success);
    flow.on('fileRetry', retry);

    flow.addFile(new Blob(['12']));
    var file = flow.files[0];
    expect(file.chunks.length).toBe(2);
    var firstChunk = file.chunks[0];
    var secondChunk = file.chunks[1];
    expect(firstChunk.status()).toBe('pending');
    expect(secondChunk.status()).toBe('pending');

    flow.upload();
    expect(requests.length).toBe(1);
    expect(firstChunk.status()).toBe('uploading');
    expect(secondChunk.status()).toBe('pending');

    expect(error).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();

    requests[0].respond(400);
    expect(requests.length).toBe(2);
    expect(firstChunk.status()).toBe('uploading');
    expect(secondChunk.status()).toBe('pending');

    expect(error).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();

    requests[1].respond(200);
    expect(requests.length).toBe(3);
    expect(firstChunk.status()).toBe('success');
    expect(secondChunk.status()).toBe('uploading');

    expect(error).not.toHaveBeenCalled();
    expect(progress.callCount).toBe(1);
    expect(success).not.toHaveBeenCalled();
    expect(retry.callCount).toBe(1);

    requests[2].respond(400);
    expect(requests.length).toBe(4);
    expect(firstChunk.status()).toBe('success');
    expect(secondChunk.status()).toBe('uploading');

    expect(error).not.toHaveBeenCalled();
    expect(progress.callCount).toBe(1);
    expect(success).not.toHaveBeenCalled();
    expect(retry.callCount).toBe(2);

    requests[3].respond(400, {}, 'Err');
    expect(requests.length).toBe(4);
    expect(file.chunks.length).toBe(0);

    expect(error.callCount).toBe(1);
    expect(error).toHaveBeenCalledWith(file, 'Err', secondChunk);
    expect(progress.callCount).toBe(1);
    expect(success).not.toHaveBeenCalled();
    expect(retry.callCount).toBe(2);

    expect(file.error).toBeTruthy();
    expect(file.isComplete()).toBeTruthy();
    expect(file.isUploading()).toBeFalsy();
    expect(file.progress()).toBe(1);
  });

  xit('should retry file with timeout', function () {
    jasmine.Clock.useMock();
    flow.opts.testChunks = false;
    flow.opts.maxChunkRetries = 1;
    flow.opts.chunkRetryInterval = 100;

    var error = jasmine.createSpy('error');
    var success = jasmine.createSpy('success');
    var retry = jasmine.createSpy('retry');
    flow.on('fileError', error);
    flow.on('fileSuccess', success);
    flow.on('fileRetry', retry);

    flow.addFile(new Blob(['12']));
    var file = flow.files[0];
    flow.upload();
    expect(requests.length).toBe(1);

    requests[0].respond(400);
    expect(requests.length).toBe(1);
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();
    expect(file.chunks[0].status()).toBe('uploading');

    jasmine.Clock.tick(100);
    expect(requests.length).toBe(2);
    requests[1].respond(200);
    expect(error).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();
  });

  xit('should fail on permanent error', function () {
    flow.opts.testChunks = false;
    flow.opts.chunkSize = 1;
    flow.opts.simultaneousUploads = 2;
    flow.opts.maxChunkRetries = 1;
    flow.opts.permanentErrors = [500];

    var error = jasmine.createSpy('error');
    var success = jasmine.createSpy('success');
    var retry = jasmine.createSpy('retry');
    flow.on('fileError', error);
    flow.on('fileSuccess', success);
    flow.on('fileRetry', retry);

    flow.addFile(new Blob(['abc']));
    var file = flow.files[0];
    expect(file.chunks.length).toBe(3);
    flow.upload();
    expect(requests.length).toBe(2);
    requests[0].respond(500);
    expect(requests.length).toBe(2);
    expect(error).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  xit('should fail on permanent test error', function () {
    flow.opts.testChunks = true;
    flow.opts.chunkSize = 1;
    flow.opts.simultaneousUploads = 2;
    flow.opts.maxChunkRetries = 1;
    flow.opts.permanentErrors = [500];

    var error = jasmine.createSpy('error');
    var success = jasmine.createSpy('success');
    var retry = jasmine.createSpy('retry');
    flow.on('fileError', error);
    flow.on('fileSuccess', success);
    flow.on('fileRetry', retry);

    flow.addFile(new Blob(['abc']));
    flow.upload();
    expect(requests.length).toBe(2);
    requests[0].respond(500);
    expect(requests.length).toBe(2);
    expect(error).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  xit('should upload empty file', function () {
    var error = jasmine.createSpy('error');
    var success = jasmine.createSpy('success');
    flow.on('fileError', error);
    flow.on('fileSuccess', success);

    flow.addFile(new Blob([]));
    var file = flow.files[0];
    flow.upload();
    expect(requests.length).toBe(1);
    expect(file.progress()).toBe(0);
    requests[0].respond(200);
    expect(requests.length).toBe(1);
    expect(error).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
    expect(file.progress()).toBe(1);
    expect(file.isUploading()).toBe(false);
    expect(file.isComplete()).toBe(true);
  });

  xit('should not upload folder', function () {
    // http://stackoverflow.com/questions/8856628/detecting-folders-directories-in-javascript-filelist-objects
    flow.addFile({
      name: '.',
      size: 0
    });
    expect(flow.files.length).toBe(0);
    flow.addFile({
      name: '.',
      size: 4096
    });
    expect(flow.files.length).toBe(0);
    flow.addFile({
      name: '.',
      size: 4096 * 2
    });
    expect(flow.files.length).toBe(0);
  });

  xit('should preprocess chunks', function () {
    var preprocess = jasmine.createSpy('preprocess');
    var error = jasmine.createSpy('error');
    var success = jasmine.createSpy('success');
    flow.on('fileError', error);
    flow.on('fileSuccess', success);
    flow.opts.preprocess = preprocess;
    flow.addFile(new Blob(['abc']));
    var file = flow.files[0];
    flow.upload();
    expect(requests.length).toBe(0);
    expect(preprocess).wasCalledWith(file.chunks[0]);
    expect(file.chunks[0].preprocessState).toBe(1);
    file.chunks[0].preprocessFinished();
    expect(requests.length).toBe(1);
    requests[0].respond(200, [], "response");
    expect(success).wasCalledWith(file, "response", file.chunks[0]);
    expect(error).not.toHaveBeenCalled();
  });

  xit('should preprocess chunks and wait for preprocess to finish', function () {
    flow.opts.simultaneousUploads = 1;
    var preprocess = jasmine.createSpy('preprocess');
    flow.opts.preprocess = preprocess;
    flow.addFile(new Blob(['abc']));
    flow.addFile(new Blob(['abca']));
    var file = flow.files[0];
    var secondFile = flow.files[1];
    flow.upload();
    expect(requests.length).toBe(0);
    expect(preprocess).wasCalledWith(file.chunks[0]);
    expect(preprocess).wasNotCalledWith(secondFile.chunks[0]);

    flow.upload();
    expect(preprocess).wasNotCalledWith(secondFile.chunks[0]);
  });

  xit('should set chunk as a third event parameter', function () {
    var success = jasmine.createSpy('success');
    flow.on('fileSuccess', success);
    flow.addFile(new Blob(['abc']));
    var file = flow.files[0];
    flow.upload();
    requests[0].respond(200, [], "response");
    expect(success).wasCalledWith(file, "response", file.chunks[0]);
  });

  xit('should have upload speed', function() {
    var clock = sinon.useFakeTimers();
    flow.opts.testChunks = false;
    flow.opts.speedSmoothingFactor = 0.5;
    flow.opts.simultaneousUploads = 1;
    var fileProgress = jasmine.createSpy('fileProgress');
    flow.on('fileProgress', fileProgress);
    flow.addFile(new Blob(['0123456789']));
    flow.addFile(new Blob(['12345']));
    var fileFirst = flow.files[0];
    var fileSecond = flow.files[1];
    expect(fileFirst.currentSpeed).toBe(0);
    expect(fileFirst.averageSpeed).toBe(0);
    expect(fileFirst.sizeUploaded()).toBe(0);
    expect(fileFirst.timeRemaining()).toBe(Number.POSITIVE_INFINITY);
    expect(flow.sizeUploaded()).toBe(0);
    expect(flow.timeRemaining()).toBe(Number.POSITIVE_INFINITY);
    flow.upload();

    clock.tick(1000);
    requests[0].progress(50, 100, true);
    expect(fileProgress).toHaveBeenCalled();
    expect(fileFirst.currentSpeed).toBe(5);
    expect(fileFirst.averageSpeed).toBe(2.5);
    expect(fileFirst.sizeUploaded()).toBe(5);
    expect(fileFirst.timeRemaining()).toBe(2);

    expect(flow.sizeUploaded()).toBe(5);
    expect(flow.timeRemaining()).toBe(4);

    clock.tick(1000);
    requests[0].progress(10, 10, true);
    expect(fileFirst.currentSpeed).toBe(5);
    expect(fileFirst.averageSpeed).toBe(3.75);

    requests[0].respond(200, [], "response");
    expect(fileFirst.currentSpeed).toBe(0);
    expect(fileFirst.averageSpeed).toBe(0);

    requests[1].respond(200, [], "response");
    expect(fileFirst.sizeUploaded()).toBe(10);
    expect(fileFirst.timeRemaining()).toBe(0);
    expect(fileSecond.sizeUploaded()).toBe(5);
    expect(fileSecond.timeRemaining()).toBe(0);
    expect(flow.sizeUploaded()).toBe(15);
    expect(flow.timeRemaining()).toBe(0);

    // paused and resumed
    flow.addFile(new Blob(['012345678901234']));
    var fileThird = flow.files[2];
    expect(fileThird.timeRemaining()).toBe(Number.POSITIVE_INFINITY);
    flow.upload();
    clock.tick(1000);
    requests[2].progress(10, 15, true);
    expect(fileThird.timeRemaining()).toBe(1);
    expect(flow.timeRemaining()).toBe(1);
    fileThird.pause();
    expect(fileThird.timeRemaining()).toBe(0);
    expect(flow.timeRemaining()).toBe(0);
    fileThird.resume();
    expect(fileThird.timeRemaining()).toBe(Number.POSITIVE_INFINITY);
    expect(flow.timeRemaining()).toBe(Number.POSITIVE_INFINITY);
    clock.tick(1000);
    requests[3].progress(11, 15, true);
    expect(fileThird.timeRemaining()).toBe(8);
    expect(flow.timeRemaining()).toBe(8);
    clock.tick(1000);
    requests[3].progress(12, 15, true);
    expect(fileThird.timeRemaining()).toBe(4);
    expect(flow.timeRemaining()).toBe(4);

    requests[3].respond(500);
    expect(fileThird.currentSpeed).toBe(0);
    expect(fileThird.averageSpeed).toBe(0);
    expect(fileThird.timeRemaining()).toBe(0);
    expect(flow.timeRemaining()).toBe(0);
  });
});