(function () {
  const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  const FIREBASE_PLACEHOLDER_PATTERN = /REPLACE_WITH_|YOUR_|TODO/i;
  const widgets = Array.from(document.querySelectorAll("[data-like-widget]"));

  function isConfigured(config) {
    return REQUIRED_FIREBASE_KEYS.every(function (key) {
      const value = config && config[key];
      return typeof value === "string" && value.trim() && !FIREBASE_PLACEHOLDER_PATTERN.test(value);
    });
  }

  function getStorage() {
    try {
      const testKey = "__sc2wiki_like_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function formatCount(value) {
    return new Intl.NumberFormat().format(Math.max(0, Number(value) || 0));
  }

  function setStatus(element, message) {
    if (element) {
      element.textContent = message;
    }
  }

  function setButtonText(button, message) {
    if (button) {
      button.textContent = message;
    }
  }

  function markUnavailable(widget, message, buttonLabel) {
    const countElement = widget.querySelector("[data-like-count]");
    const button = widget.querySelector("[data-like-button]");
    const status = widget.querySelector("[data-like-status]");

    widget.dataset.likeState = "unavailable";

    if (countElement) {
      countElement.textContent = "--";
    }

    if (button) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }

    setButtonText(button, buttonLabel || "Likes Offline");
    setStatus(status, message);
  }

  function renderWidget(widget, state) {
    const countElement = widget.querySelector("[data-like-count]");
    const button = widget.querySelector("[data-like-button]");
    const status = widget.querySelector("[data-like-status]");

    if (countElement) {
      countElement.textContent = state.connected ? formatCount(state.count) : "--";
    }

    if (!button) {
      return;
    }

    if (state.pending) {
      widget.dataset.likeState = "pending";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-pressed", "false");
      setButtonText(button, "Saving...");
      setStatus(status, "Writing your like to the global counter...");
      return;
    }

    if (state.liked) {
      widget.dataset.likeState = "liked";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-pressed", "true");
      setButtonText(button, "Liked");
      setStatus(status, "This browser has already liked this tech tree.");
      return;
    }

    widget.dataset.likeState = state.connected ? "ready" : "loading";
    button.disabled = !state.connected;
    button.setAttribute("aria-disabled", String(!state.connected));
    button.setAttribute("aria-pressed", "false");
    setButtonText(button, state.connected ? "Like This Tree" : "Loading...");
    setStatus(
      status,
      state.connected
        ? "Global likes are synced through Firebase Realtime Database."
        : "Connecting to the shared like counter..."
    );
  }

  function startWidget(widget, database, storage) {
    const treeKey = String(widget.dataset.treeKey || "").trim().toLowerCase();
    const treeLabel = String(widget.dataset.treeLabel || treeKey || "tech tree");
    const button = widget.querySelector("[data-like-button]");
    const storageKey = "sc2wiki.likes.v1." + treeKey;
    const countRef = database.ref("techTreeLikes/" + treeKey + "/count");

    const state = {
      count: 0,
      connected: false,
      liked: storage.getItem(storageKey) === "liked",
      pending: false
    };

    if (!treeKey || !button) {
      markUnavailable(widget, "Like widget is missing a tree identifier.", "Unavailable");
      return;
    }

    renderWidget(widget, state);

    countRef.on(
      "value",
      function (snapshot) {
        state.connected = true;
        state.count = Number(snapshot.val()) || 0;
        state.liked = storage.getItem(storageKey) === "liked";
        renderWidget(widget, state);
      },
      function (error) {
        console.error("Failed to load likes for", treeKey, error);
        state.connected = false;
        renderWidget(widget, state);
        setStatus(widget.querySelector("[data-like-status]"), "Could not read the live like count right now.");
      }
    );

    button.addEventListener("click", function () {
      if (state.pending || state.liked || !state.connected) {
        return;
      }

      state.pending = true;
      renderWidget(widget, state);

      countRef
        .transaction(function (currentValue) {
          return (Number(currentValue) || 0) + 1;
        })
        .then(function (result) {
          if (!result.committed) {
            state.pending = false;
            renderWidget(widget, state);
            setStatus(widget.querySelector("[data-like-status]"), "Your like was not saved. Try again.");
            return;
          }

          storage.setItem(storageKey, "liked");
          state.pending = false;
          state.liked = true;
          state.count = Number(result.snapshot.val()) || state.count + 1;
          renderWidget(widget, state);
        })
        .catch(function (error) {
          console.error("Failed to save like for", treeKey, error);
          state.pending = false;
          renderWidget(widget, state);
          setStatus(
            widget.querySelector("[data-like-status]"),
            "Could not save your like for " + treeLabel + ". Check your Firebase config and database rules."
          );
        });
    });

    window.addEventListener("storage", function (event) {
      if (event.key !== storageKey) {
        return;
      }

      state.liked = storage.getItem(storageKey) === "liked";
      renderWidget(widget, state);
    });
  }

  function initLikes() {
    if (!widgets.length) {
      return;
    }

    const storage = getStorage();
    if (!storage) {
      widgets.forEach(function (widget) {
        markUnavailable(widget, "Local storage is disabled, so one-like-per-device cannot be enforced.", "Storage Off");
      });
      return;
    }

    if (!window.firebase) {
      widgets.forEach(function (widget) {
        markUnavailable(widget, "Firebase scripts did not load, so the shared like counter is offline.", "Likes Offline");
      });
      return;
    }

    const config = window.SC2_WIKI_FIREBASE_CONFIG || {};
    if (!isConfigured(config)) {
      widgets.forEach(function (widget) {
        markUnavailable(widget, "Add your Firebase web config in firebase-config.js to enable the shared like counter.", "Configure Firebase");
      });
      return;
    }

    try {
      window.firebase.apps && window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(config);
      const database = window.firebase.database();
      widgets.forEach(function (widget) {
        startWidget(widget, database, storage);
      });
    } catch (error) {
      console.error("Failed to initialize Firebase likes", error);
      widgets.forEach(function (widget) {
        markUnavailable(widget, "Firebase could not initialize. Re-check firebase-config.js and your database setup.", "Likes Offline");
      });
    }
  }

  initLikes();
}());
