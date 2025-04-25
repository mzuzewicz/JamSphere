var userName = Math.random().toString(36).slice(2);
const password = "x";

// large components
const hoverBox = document.querySelector("#hover-box");
const menuEl = document.querySelector("#menu-buttons");
const callButtons = document.querySelector("#call-menu");
const jamsphereLogo = document.querySelector("#jamsphere-header");
const usernameEl = document.querySelector("#user-name");

const callButton = document.querySelector("#call");
const joinSessionButton = document.querySelector("#join-session");
const closeHoverButton = document.querySelector("#close-hover");
const confirmSessionButton = document.querySelector("#confirm-session-code");

//menu buttons
const hangupButton = document.querySelector("#hangup-button");
const volumeButton = document.querySelector("#set-volume-button");
const eqButton = document.querySelector("#eq-button");
const setInputButton = document.querySelector("#set-input-button");
const setOutputButton = document.querySelector("#set-output-button");

//popup dialogs when menu buttons are pressed e.g. volume, eq etc
const volumeControlBox = document.querySelector("#volume-slider");
var volumeSlider = document.querySelector("#vol-control");
const inputSelector = document.querySelector("#audioInputSelect");
const outputSelector = document.querySelector("#audioOutputSelect");

//html elements holding video streams from local and remote
const localVideoEl = document.querySelector("#local-video");
const remoteVideoEl = document.querySelector("#remote-video");

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;

//if trying it on a phone, use this instead...
const socket = io.connect("https://10.5.0.2:8181/", {
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

const audioInputSelect = document.querySelector("select#audioSource");
const audioOutputSelect = document.querySelector("select#audioOutput");
const selectors = [audioInputSelect, audioOutputSelect];
let hasMic = false;
let openMic = undefined;
let hasPermission = false;

audioOutputSelect.disabled = !("sinkId" in HTMLMediaElement.prototype);

function getDevices() {
	navigator.mediaDevices.enumerateDevices().then(gotDevices);
}

function gotDevices(deviceInfos) {
	console.log("gotDevices", deviceInfos);
	hasMic = false;
	hasPermission = false;
	//handles being called several times to update labels. preserve values.
	const values = selectors.map((select) => select.value);
	selectors.forEach((select) => {
		while (select.firstChild) {
			select.removeChild(select.firstChild);
		}
	});
	for (let i = 0; i !== deviceInfos.length; ++i) {
		const deviceInfo = deviceInfos[i];
		if (deviceInfo.deviceId == "") {
			continue;
		}
		//if we get at least one deviceId, then user has granted media permissions
		hasPermission = true;
		const option = document.createElement("option");
		option.value = deviceInfo.deviceId;
		if (deviceInfo.kind === "audioinput") {
			hasMic = true;
			option.text =
				deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
			audioInputSelect.appendChild(option);
		} else if (deviceInfo.kind === "audiooutput") {
			option.text =
				deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
			audioOutputSelect.appendChild(option);
		} else {
			console.log("Some other kind of source/device: ", deviceInfo);
		}
	}
	selectors.forEach((select, selectorIndex) => {
		if (
			Array.prototype.slice
				.call(select.childNodes)
				.some((n) => n.value === values[selectorIndex])
		) {
			select.value = values[selectorIndex];
		}
	});
}

//attach audio output device to video element using device/sink ID
function attachSinkId(element, sinkId) {
	if (typeof element.sinkId !== "undefined") {
		element
			.setSinkId(sinkId)
			.then(() => {
				console.log(`Success, audio output device attached: ${sinkId}`);
			})
			.catch((error) => {
				let errorMessage = error;
				if (error.name === "SecurityError") {
					errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
				}
				console.error(errorMessage);
				// Jump back to first output device in the list as it's the default.
				audioOutputSelect.selectedIndex = 0;
			});
	} else {
		console.warn("Browser does not support output device Selection.");
	}
}

function changeAudioDestination() {
	const audioDestination = audioOutputSelect.value;
	attachSinkId(localVideoEl, audioDestination);
}

function gotStream(stream) {
	window.stream = stream;
	localVideoEl.srcObject = stream;
	if (stream.getAudioTracks()[0]) {
		openMic = stream.getAudioTracks()[0].getSettings().deviceId;
	}
	return getDevices();
}

// once audio input/output has been changed, restart stream with new constraints
function restartCall() {
	const audioSource = audioInputSelect.value || undefined;

	if (hasPermission && openMic == audioSource) {
		return;
	}
	if (window.stream) {
		window.stream.getTracks().forEach((track) => {
			track.stop();
		});
		openMic = undefined;
	}
	const constraints = {
		audio: true,
		video: true,
	};
	if (hasMic) {
		constraints["audio"] = {
			deviceId: audioSource ? { exact: audioSource } : undefined,
		};
	}
	if (!hasPermission || hasMic) {
		navigator.mediaDevices.getUserMedia(constraints).then(gotStream);
	}
}

audioInputSelect.onchange = restartCall;
audioOutputSelect.onchange = changeAudioDestination;
navigator.mediaDevices.ondevicechange = getDevices;

getDevices();

//when a client initiates a call
const call = async (e) => {
	await fetchUserMedia();

	//peerConnection is all set with our STUN servers sent over
	await createPeerConnection();

	//create offer
	try {
		console.log("Creating offer...");
		const offer = await peerConnection.createOffer();
		//console.log(offer);
		//console.log(broadcastedOffers);
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
	//console.log(offerObj);
	//console.log(answer);
	//add the answer to the offerObj so the server knows which offer this is related to
	offerObj.answer = answer;
	//emit the answer to the signaling server, so it can emit to CLIENT1
	//expect a response from the server with the already existing ICE candidates
	const offerIceCandidates = await socket.emitWithAck("newAnswer", offerObj);
	offerIceCandidates.forEach((c) => {
		peerConnection.addIceCandidate(c);
		console.log("======Added Ice Candidate======");
	});
	//console.log(offerIceCandidates);
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
			//console.log(e);
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
			//console.log(e);
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
	//dirty version, will improve
	peerConnection.close();
	localStream.getTracks().forEach((track) => {
		track.stop();
	});
	socket.disconnect(true);
	document.querySelector("#user-name").innerHTML = "";
	localVideoEl.classList.remove("open");
	remoteVideoEl.classList.remove("open");
	menuEl.classList.remove("callactive");
	callButtons.classList.remove("callactive");
	jamsphereLogo.classList.remove("callactive");
	if (isVisible(volumeControlBox)) {
		volumeControlBox.classList.remove("pressed");
	}
	//reloading the page forces a new username code to be generated, which allows a different call to be set up after hangup
	location.reload();
};

volumeButton.addEventListener("click", () => {
	if (!isVisible(volumeControlBox)) {
		//close all other popups for readability
		inputSelector.classList.remove("open");
		outputSelector.classList.remove("open");
		volumeControlBox.classList.add("pressed");

		const referenceDiv = document.getElementById("set-volume-button");
		const targetDiv = document.getElementById("volume-slider");

		const rect = referenceDiv.getBoundingClientRect(); // Get reference div position
		targetDiv.style.position = "absolute";
		targetDiv.style.top = `${rect.top - 90}px`; // Adjust position relative to reference-div
		targetDiv.style.left = `${rect.left - 12}px`;
	} else {
		volumeControlBox.classList.remove("pressed");
	}
});

var setVolume = function () {
	if (remoteStream.getAudioTracks().length > 0) {
		remoteVideoEl.volume = volumeSlider.value / 100;
		console.log("volume after change: ", remoteVideoEl.volume);
	}
};

function isVisible(element) {
	const style = window.getComputedStyle(element);
	return style.visibility !== "hidden";
}

callButton.addEventListener("click", () => {
	socket.emit("checkOffers");
	call();
});

joinSessionButton.addEventListener("click", () => {
	var errorMsg = document.getElementById("error-msg");
	errorMsg.textContent = "";
	hoverBox.classList.add("open");
});

closeHoverButton.addEventListener("click", () => {
	hoverBox.classList.remove("open");
});

confirmSessionButton.addEventListener("click", () => {
	answerByCode(broadcastedOffers);
});

// menu button listeners
hangupButton.addEventListener("click", () => {
	hangup();
});

setInputButton.addEventListener("click", () => {
	if (!isVisible(inputSelector)) {
		//close all other popups for readability
		volumeControlBox.classList.remove("pressed");
		outputSelector.classList.remove("open");
		inputSelector.classList.add("open");

		const referenceDiv = setInputButton;
		const targetDiv = inputSelector;

		const rect = referenceDiv.getBoundingClientRect(); // Get reference div position
		targetDiv.style.position = "absolute";
		targetDiv.style.top = `${rect.top - 70}px`; // Adjust position relative to reference-div
		targetDiv.style.left = `${rect.left - 100}px`;
	} else {
		inputSelector.classList.remove("open");
	}
});

setOutputButton.addEventListener("click", () => {
	if (!isVisible(outputSelector)) {
		//close all other popups for readability
		volumeControlBox.classList.remove("pressed");
		inputSelector.classList.remove("open");
		outputSelector.classList.add("open");

		const referenceDiv = setOutputButton;
		const targetDiv = outputSelector;

		const rect = referenceDiv.getBoundingClientRect(); // Get reference div position
		targetDiv.style.position = "absolute";
		targetDiv.style.top = `${rect.top - 70}px`; // Adjust position relative to reference-div
		targetDiv.style.left = `${rect.left - 100}px`;
	} else {
		outputSelector.classList.remove("open");
	}
});
