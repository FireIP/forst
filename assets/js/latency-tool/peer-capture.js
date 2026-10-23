(function () {
  const OriginalRTCPeerConnection = window.RTCPeerConnection;

  function PatchedRTCPeerConnection(...args) {
    const connection = new OriginalRTCPeerConnection(...args);
    const event = new CustomEvent('_pc_created', {
      detail: {
        pc: connection,
        owner: window.__g2gPeerConnectionOwner || 'external',
      },
    });
    document.dispatchEvent(event);
    return connection;
  }

  PatchedRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  Object.setPrototypeOf(PatchedRTCPeerConnection, OriginalRTCPeerConnection);
  window.RTCPeerConnection = PatchedRTCPeerConnection;
})();
