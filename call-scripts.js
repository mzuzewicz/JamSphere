const userName = Math.random().toString(36).slice(2);
const password = "x";

const hoverBox = document.querySelector("#hover-box");
const hangupButton = document.querySelector("#hangup-button");
const menuEl = document.querySelector("#menu-buttons");
const callButtons = document.querySelector("#call-menu");
const jamsphereLogo = document.querySelector("#jamsphere-header");
const usernameEl = document.querySelector("#user-name");

var volumeSlider = document.querySelector("#my-range");

//menu buttons

const localVideoEl = document.querySelector("#local-video");
const remoteVideoEl = document.querySelector("#remote-video");

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;

//if trying it on a phone, use this instead...
const socket = io.connect("https://192.168.2.230:8181/", {
	//const socket = io.connect('https://localhost:8181/',{
	auth: {
		userName,
		password,
	},
});

let peerConfiguration = {
	iceServers: [
		{
			urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
		},
	],
};

//when a client initiates a call
const call = async (e) => {
	await fetchUserMedia();

	//peerConnection is all set with our STUN servers sent over
	await createPeerConnection();

	//create offer
	try {
		console.log("Creating offer...");
		const offer = await peerConnection.createOffer();
		console.log(offer);
		console.log(broadcastedOffers);
		peerConnection.setLocalDescription(offer);
		didIOffer = true;
		socket.emit("newOffer", offer); //send offer to signalingServer
		localVideoEl.classList.add("open");
		remoteVideoEl.classList.add("open");
		menuEl.classList.add("callactive");
		callButtons.classList.add("callactive");
		jamsphereLogo.classList.add("callactive");
		usernameEl.innerHTML += "   Session Code: " + userName;
	} catch (err) {
		console.log(err);
	}
};

const answerOffer = async (offerObj) => {
	await fetchUserMedia();
	await createPeerConnection(offerObj);
	const answer = await peerConnection.createAnswer({});
	await peerConnection.setLocalDescription(answer); //CLIENT2 uses the answer as the localDesc
	console.log(offerObj);
	console.log(answer);
	//add the answer to the offerObj so the server knows which offer this is related to
	offerObj.answer = answer;
	//emit the answer to the signaling server, so it can emit to CLIENT1
	//expect a response from the server with the already existing ICE candidates
	const offerIceCandidates = await socket.emitWithAck("newAnswer", offerObj);
	offerIceCandidates.forEach((c) => {
		peerConnection.addIceCandidate(c);
		console.log("======Added Ice Candidate======");
	});
	console.log(offerIceCandidates);
};

const addAnswer = async (offerObj) => {
	//addAnswer is called in socketListeners when an answerResponse is emitted.
	//at this point, the offer and answer have been exchanged!
	//now CLIENT1 needs to set the remote
	await peerConnection.setRemoteDescription(offerObj.answer);
	// console.log(peerConnection.signalingState)
};

const answerByCode = (offers) => {
	var sessionCode = offers.find((obj) => {
		return obj.offererUserName === document.querySelector("#answer-code").value;
	});
	if (sessionCode) {
		answerOffer(sessionCode);
		localVideoEl.classList.add("open");
		remoteVideoEl.classList.add("open");
		menuEl.classList.add("callactive");
		callButtons.classList.add("callactive");
		jamsphereLogo.classList.add("callactive");
		hoverBox.classList.remove("open");

		return true;
	} else {
		var errorMsg = document.getElementById("error-msg");
		errorMsg.textContent = "Invalid session code!";
		return false;
	}
};

const fetchUserMedia = () => {
	return new Promise(async (resolve, reject) => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { min: 1024, ideal: 1280, max: 1920 },
					height: { min: 576, ideal: 720, max: 1080 },
				},
				audio: {
					channels: 2,
					sampleRate: 44100,
					autoGainControl: false,
					echoCancellation: false,
					noiseSuppression: false,
				},
			});
			localVideoEl.srcObject = stream;
			localVideoEl.muted = true;
			localStream = stream;
			resolve();
		} catch (err) {
			console.log(err);
			reject();
		}
	});
};

const createPeerConnection = (offerObj) => {
	return new Promise(async (resolve, reject) => {
		//RTCPeerConnection is the thing that creates the connection
		//we can pass a config object, and that config object can contain stun servers
		//which will fetch us ICE candidates'
		peerConnection = await new RTCPeerConnection(peerConfiguration);
		remoteStream = new MediaStream();
		remoteVideoEl.srcObject = remoteStream;

		localStream.getTracks().forEach((track) => {
			//add localtracks so that they can be sent once the connection is established
			peerConnection.addTrack(track, localStream);
		});

		peerConnection.addEventListener("signalingstatechange", (event) => {
			console.log(event);
			console.log(peerConnection.signalingState);
		});

		peerConnection.addEventListener("icecandidate", (e) => {
			console.log("........Ice candidate found!......");
			console.log(e);
			if (e.candidate) {
				socket.emit("sendIceCandidateToSignalingServer", {
					iceCandidate: e.candidate,
					iceUserName: userName,
					didIOffer,
				});
			}
		});

		//get video and audio tracks from peers, and display on other peer's screen
		peerConnection.addEventListener("track", (e) => {
			console.log("Got a track from the other peer!! How exciting");
			console.log(e);
			e.streams[0].getTracks().forEach((track) => {
				remoteStream.addTrack(track, remoteStream);
				console.log("Here's an exciting moment... fingers cross");
			});
		});

		if (offerObj) {
			//this won't be set when called from call();
			//will be set when we call from answerOffer()
			// console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
			await peerConnection.setRemoteDescription(offerObj.offer);
			// console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
		}
		resolve();
	});
};

const addNewIceCandidate = (iceCandidate) => {
	peerConnection.addIceCandidate(iceCandidate);
	console.log("======Added Ice Candidate======");
};

const hangup = () => {
	//offers.remove();
	//dirty version, will improve
	if (peerConnection) {
		peerConnection.close();
		localStream.getTracks().forEach(function (track) {
			track.stop();
		});
		socket.disconnect(true);
		document.querySelector("#user-name").innerHTML = "";
		localVideoEl.classList.remove("open");
		remoteVideoEl.classList.remove("open");
		menuEl.classList.remove("callactive");
		callButtons.classList.remove("callactive");
		jamsphereLogo.classList.remove("callactive");
	}
	/*if (didIOffer) {
    broadcastedOffers.filter((a) => a.offererUserName != userName);
    console.log(broadcastedOffers);
  }*/
};

/*volumeSlider.addEventListener("change", () => {
	remoteVideoEl.volume = this.value;
});*/

document.querySelector("#call").addEventListener("click", () => {
	socket.emit("checkOffers");
	call();
});

document.querySelector("#join-session").addEventListener("click", () => {
	var errorMsg = document.getElementById("error-msg");
	errorMsg.textContent = "";
	hoverBox.classList.add("open");
});

document.querySelector("#close-hover").addEventListener("click", () => {
	hoverBox.classList.remove("open");
});

document
	.querySelector("#confirm-session-code")
	.addEventListener("click", () => {
		answerByCode(broadcastedOffers);
	});

hangupButton.addEventListener("click", () => {
	hangup();
});
