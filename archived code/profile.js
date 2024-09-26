let contentId;
let content;

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".btn-outline-secondary").forEach((button) => {
    button.addEventListener("click", function () {
      contentId = this.id; // 'personality', 'resume', 'date', 'debate'
      content = proxy[contentId] || ""; // Fetch the content based on contentId
      prompt = proxy[contentId+"Prompt"];
      // Set the value of the hidden input and the textarea
      document.getElementById("contentIdField").value = contentId;
      document.getElementById("contentField").value = content;
      document.getElementById("editModalLabel").innerText = contentId.charAt(0).toUpperCase() + contentId.slice(1); // Capitalizes the first letter
      document.getElementById("prompt").innerText = prompt; // Capitalizes the first letter

      // Show the modal
      new bootstrap.Modal(document.getElementById("editModal")).show();
    });
  });
});

// Initialize tooltips globally
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function(tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl, {
    // delay: { "show": 100, "hide": 2000 }  // Increase hide delay
  });
});

function shareProProxy(button) {
  // Open the modal
  var myModal = new bootstrap.Modal(document.getElementById('shareModal'), {});
  myModal.show();
}

function updateUrl() {
  var roleInput = document.getElementById("roleInput");
  var orgInput = document.getElementById("orgInput");
  var interviewerInput = document.getElementById("interviewerInput");
  var urlInput = document.getElementById("urlInput");

  var url = window.location+"interview";
  if (roleInput && roleInput.value) {
    url += "?role=" + encodeURIComponent(roleInput.value);
  }

  if (orgInput && orgInput.value) {
    url += (roleInput && roleInput.value || orgInput && orgInput.value ? "&" : "?") + "org=" + encodeURIComponent(orgInput.value);
  }

  if (interviewerInput && interviewerInput.value) {
    url += (roleInput && roleInput.value || orgInput && orgInput.value ? "&" : "?") + "interviewer=" + encodeURIComponent(interviewerInput.value);
  }

  urlInput.value = url;
}

function copyUrl() {
  var urlInput = document.getElementById("urlInput");
  urlInput.select();
  urlInput.setSelectionRange(0, 99999); // For mobile devices
  document.execCommand("copy");
}

function generateUrl() {
  var roleInput = document.getElementById("roleInput");
  var orgInput = document.getElementById("orgInput");
  var interviewerInput = document.getElementById("interviewerInput");

  var url = "<%= url + 'interview' %>";
  if (roleInput && roleInput.value) {
    url += "?role=" + encodeURIComponent(roleInput.value);
  }

  if (orgInput && orgInput.value) {
    url += (roleInput && roleInput.value ? "&" : "?") + "org=" + encodeURIComponent(orgInput.value);
  }

  if (interviewerInput && interviewerInput.value) {
    url += (roleInput && roleInput.value || orgInput && orgInput.value ? "&" : "?") + "interviewer=" + encodeURIComponent(interviewerInput.value);
  }

  // Copy the URL to the clipboard
  navigator.clipboard.writeText(url).then(function() {
    alert("URL copied to clipboard");
  }, function(err) {
    alert("Could not copy URL: ", err);
  });
}

function shareProxy(button) {
  var copyText = button.value;

  // Copy the text to the clipboard
  navigator.clipboard
    .writeText(copyText)
    .then(() => {
      // Update the tooltip content
      updateTooltip(button, "URL Copied");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      updateTooltip(button, "Failed to copy");
    });
}

// Function to update the tooltip
function updateTooltip(button, message) {
  var tooltipInstance = bootstrap.Tooltip.getInstance(button);
  tooltipInstance.hide(); // Hide the current tooltip

  button.setAttribute("data-bs-original-title", message); // Set new tooltip content
  tooltipInstance.show(); // Show updated tooltip

  // Optionally, reset the tooltip message after some time
  // Extend the duration tooltip is shown
  setTimeout(() => {
    tooltipInstance.hide();
    // Reset to original message after the extended duration
    button.setAttribute("data-bs-original-title", "Click to copy URL");
  }, 2000); // Show success message for 5 seconds
}

function submitForm() {
  contentId = document.getElementById("contentIdField").value;
  content = document.getElementById("contentField").value;

  // Prepare the data to be sent
  const formData = {
    contentId: contentId,
    content: content,
  };

  // Use fetch to send the form data to the server
  fetch("/update-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Success:", data);
      // alert('Record updated successfully'); // Show success message
      console.log(content);
      proxy[contentId] = content; // Update the proxy object
      // Update the content of the "Personality" paragraph if applicable
      if (contentId === "introduction") {
        document.getElementById("personalityContent").textContent = content;
      }

      // Attempt to hide the modal
      try {
        var editModal = bootstrap.Modal.getInstance(
          document.getElementById("editModal")
        );
        editModal.hide();
      } catch (error) {
        console.error("Failed to hide the modal:", error);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("Failed to update record"); // Show error message
    });
    console.log(proxy)
  // Prevent the form from submitting in the traditional way
  return false;
}
