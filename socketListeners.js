var broadcastedOffers;

//on connection get all available offers
socket.on('availableOffers',offers=>{
    broadcastedOffers = offers;
    console.log(offers.forEach(o=>console.log(o.offererUserName)));

})

//someone just made a new offer and we're already here - update offers for answerers
socket.on('newOfferAwaiting',offers=>{
    //console.log(offers);
    broadcastedOffers = offers;
})

socket.on('answerResponse',offerObj=>{
    //console.log(offerObj);
    addAnswer(offerObj);
})

socket.on('receivedIceCandidateFromServer',iceCandidate=>{
    addNewIceCandidate(iceCandidate);
    //console.log(iceCandidate);
})
