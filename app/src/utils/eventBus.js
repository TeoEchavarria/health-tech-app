// Simple event bus for app-wide event emission and listening
// Used for syncing events, push notifications, etc.

class SimpleEventEmitter {
  constructor() {
    this.listeners = {};
  }

  addListener(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return object with remove method
    return {
      remove: () => {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    };
  }

  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  removeAll(event) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

const eventBus = new SimpleEventEmitter();

export const EventEmitter = {
  addListener: (event, cb) => eventBus.addListener(event, cb),
  emit: (event, payload) => eventBus.emit(event, payload),
  removeAll: (event) => eventBus.removeAll(event)
};

