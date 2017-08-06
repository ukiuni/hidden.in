var localVideo = document.getElementById('localVideo');
var localStream = null;
var remoteVideoElements = [];
var peerConnections = [];
var mediaConstraints = {
    'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
    }
};
var selfId;
function toFullScreenable(target) {
    target.requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen || target.msRequestFullscreen;
    target.onclick = function () {
        if (!document.webkitIsFullScreen) {
            target.webkitRequestFullscreen();
        } else {
            document.webkitExitFullscreen();
        }
    }
}
toFullScreenable(localVideo);

var socketReady = false;
var reloadFunction = function () { }
var joinedToRoom = false;
var socket = io.connect('/');
socket.on('connect', function (event) {
    socketReady = true;
})
function joinToRoom() {
    socket.json.emit("join", { room: location.pathname });
    socket.on('joined', function (event) {
        joinedToRoom = true;
        selfId = event.id;
    }).on('otherJoined', function (event) {
        sendOffer(event.id);
    }).on('message', function (event) {
        if (event.data.type === 'offer') {
            var id = event.id;
            if (peerConnections[id]) {
                peerConnections[id].close();
            }
            var peerConnection = prepareNewConnection(id);
            peerConnections[id] = peerConnection;
            peerConnection.setRemoteDescription(new RTCSessionDescription(event.data));
            sendAnswer(event);
        } else if (event.data.type === 'answer') {
            var peerConnection = peerConnections[event.id];
            if (!peerConnection) {
                console.error('peer NOT exists');
                return;
            }
            peerConnection.setRemoteDescription(new RTCSessionDescription(event.data));
        } else if (event.data.type === 'candidate') {
            if (!peerConnections[event.id]) {
                peerConnections[event.id] = prepareNewConnection();
            }
            var peerConnection = peerConnections[event.id];
            var candidate = new RTCIceCandidate({ sdpMLineIndex: event.data.sdpMLineIndex, sdpMid: event.data.sdpMid, candidate: event.data.candidate });
            peerConnection.addIceCandidate(candidate);
        } else if (event.data.type === 'stop') {
            stopPeer(event.id);
        }
    }).on("otherDisconnected", function (event) {
        stopPeer(event.id);
    }).on("stop", function (event) {
        peerConnections[event.id].close();
    }).on("lockouted", function (event) {
        openDialog("lockoutedDialog");
    }).on("locked", function (event) {
        lockRoom(true);
    });
}

function sendOffer(targetId) {
    var peerConnection = prepareNewConnection(targetId);
    peerConnections[targetId] = peerConnection;
    peerConnection.createOffer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);
        socket.json.emit("offer", {
            id: selfId,
            targetId: targetId,
            data: sessionDescription
        });
    }, function () {
    }, mediaConstraints);
}

function sendAnswer(event) {
    if (!peerConnections[event.id]) {
        console.error('peer NOT exists');
        return;
    }
    var peerConnection = peerConnections[event.id];
    peerConnection.createAnswer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);
        socket.json.send({
            id: selfId,
            data: sessionDescription
        });
    }, function () {
        console.log("Create Answer failed");
    }, mediaConstraints);
}
function openDialog(dialog) {
    if (typeof dialog === 'string') {
        dialog = document.getElementById(dialog);
    }
    dialog.style.display = "block";
    doDialogChange(dialog, 0.01, 1.2);
}
function closeDialog(dialog) {
    if (typeof dialog === 'string') {
        dialog = document.getElementById(dialog);
    }
    doDialogChange(dialog, 1, 0.9);
}
function doDialogChange(dialog, opacity, degree) {
    newOpacity = (opacity * degree);
    if (newOpacity > 1) {
        dialog.style.opacity = 1;
    } else if (newOpacity < 0.001) {
        dialog.style.opacity = 0;
        dialog.style.display = "none";
    } else {
        dialog.style.opacity = newOpacity;
        setTimeout(function () {
            doDialogChange(dialog, newOpacity, degree);
        }, 30);
    }
}
function prepareNewConnection(remoteId) {
    var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection;
    var pc_config = { "iceServers": [] };
    var peer = null;
    try {
        peer = new RTCPeerConnection(pc_config);
    } catch (e) {
        console.error("fail " + e.message);
    }

    peer.onicecandidate = function (event) {
        if (event.candidate) {
            socket.json.emit("candidate", {
                id: selfId,
                targetId: remoteId,
                data: {
                    type: "candidate",
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    sdpMid: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                }
            });
        }
    };

    peer.addStream(localStream);

    peer.addEventListener("addstream", onRemoteStreamAdded, false);
    peer.addEventListener("removestream", onRemoteStreamRemoved, false)
    var remoteVideo;
    function onRemoteStreamAdded(event) {
        var elementId = "video_" + remoteId;
        remoteVideo = document.getElementById(elementId)
        if (!remoteVideo) {
            remoteVideo = document.createElement("video");
            remoteVideo.className = "video";
            remoteVideo.id = elementId;
            document.getElementById("remoteArea").appendChild(remoteVideo);
            toFullScreenable(remoteVideo);
        }
        remoteVideo.src = URL.createObjectURL(event.stream);
        remoteVideo.load();
        remoteVideo.play();
    }
    function onRemoteStreamRemoved(event) {
        remoteVideo.src = "";
        remoteVideo.parentNode.removeChild(remoteVideo);
    }
    peer.removeElement = function () {
        onRemoteStreamRemoved();
    }
    return peer;
}

function prepareStream(stream) {
    var resetPeerIds = []
    for (var key in peerConnections) {
        resetPeerIds.push(key);
    }
    stopLocalStream();
    localStream = stream;
    localVideo.src = URL.createObjectURL(stream);
    localVideo.play();
    if (!joinedToRoom) {
        joinToRoom();
    } else {
        resetPeerIds.forEach(function (id) {
            sendOffer(id);
        });
    }
}
var firstActionForReload = true;//for fail to handshake;
function initVideoArea() {
    setTimeout(function () {
        reloadFunction();
        openDialog("videoArea");
    }, 500);
}
function startVideo() {
    reloadFunction = startVideo;
    navigator.getUserMedia({ video: true, audio: true },
        function (stream) {
            prepareStream(stream);
            if (firstActionForReload) {
                initVideoArea();
                firstActionForReload = false;
            }
        },
        function (error) {
            console.error('fail ' + error.code);
            return;
        }
    );
}
var screenShare = new SkyWay.ScreenShare({ debug: true });
function startScreenShare() {
    if (!screenShare.isEnabledExtension()) {
        if (navigator.userAgent.toLowerCase().indexOf('chrome') != -1) {
            location.href = ("screenshare_chrome_extension.crx");
            var dialog = document.getElementById("chromeExtensionInstallDialog");
        } else {
            var dialog = document.getElementById("screenShareOnlySupportedWithChrome");
        }
        document.getElementById("chromeExtensionInstallDialogCloseButton").onclick = function () {
            closeDialog(dialog);
        }
        openDialog(dialog);
        return;
    }
    reloadFunction = startScreenShare;
    screenShare.startScreenShare({
        Width: screen.width,
        Height: screen.height,
        FrameRate: 30,
        audio: false
    }, function (stream) {
        navigator.getUserMedia({ video: false, audio: true },
            function (audioStream) {
                stopLocalStream();
                var audioTrack = audioStream.getAudioTracks()[0];
                stream.addTrack(audioTrack);
                prepareStream(stream);
                if (firstActionForReload) {
                    initVideoArea();
                    firstActionForReload = false;
                }
            },
            function (error) {
                console.error('failed ' + error.code);
                return;
            }
        );
    }, function (error) {
        console.error((error) + ' load screen failed');
    });
}

function stopLocalStream() {
    if (localStream) {
        localVideo.src = "";
    }
}

function stop() {
    if (localStream) {
        localVideo.src = "";
    }
    for (var key in peerConnections) {
        peerConnections[key].removeElement();
        peerConnections[key].close();
        var closeAll = function (streams) {
            for (var stream of streams) {
                try {
                    peerConnections[key].removeStream(stream);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        var streams = peerConnections[key].getRemoteStreams();
        closeAll(streams);
        streams = peerConnections[key].getLocalStreams();
        closeAll(streams);
        delete peerConnections[key];
    }
    socket.json.emit("stop", {
        id: selfId
    });
    location.href = "/";
}

function stopPeer(id) {
    peerConnections[id].removeElement();
    peerConnections[id].close();
    delete peerConnections[id];
}
function showLink() {
    var linkText = document.getElementById("linkText");
    linkText.value = location.href;
    document.getElementById("linkCopyButton").onclick = function () {
        linkText.select();
        var retVal = document.execCommand('copy');
    }
    openDialog("linkDialog");
    document.getElementById("linkDialogCloseButton").onclick = function () {
        closeDialog("linkDialog");
    }
}

function lockRoom(displayOnly) {
    var button = document.getElementById("lockButton");
    button.onclick = unlockRoom;
    button.getElementsByTagName("img")[0].src = "images/unlock.png";
    if (!displayOnly) {
        socket.json.emit("lock");
    }
}
function unlockRoom() {
    //u cant unlock. everyone must out.
}
setTimeout(startVideo, 0);