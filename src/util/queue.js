
class Queue {
  constructor() {
    this.queue = [];
    this.pendingPromise = false;
  }

  get length() {
    return this.queue.length;
  }

  enqueue(promise) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        promise,
        resolve,
        reject,
      });
      this.asyncDequeue();
    });
  }

  asyncDequeue() {
    setTimeout(() => {
      this.dequeue();
    }, 0);
  }

  dequeue() {
    if (this.pendingPromise) return false;
    if (!this.queue) return; // maybe destroied
    const item = this.queue.shift();
    if (!item) return false;
    try {
      this.pendingPromise = true;
      item.promise()
        .then((value) => {
          this.pendingPromise = false;
          item.resolve(value);
          this.asyncDequeue();
        })
        .catch((err) => {
          this.pendingPromise = false;
          item.reject(err);
          this.asyncDequeue();
        });
    } catch (err) {
      this.pendingPromise = false;
      item.reject(err);
      this.asyncDequeue();
    }
    return true;
  }

  destroy() {
    this.pendingPromise = true;
    this.queue = null;
  }
}

export default Queue;