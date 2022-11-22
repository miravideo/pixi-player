'use strict';

require('../styles/menu.less');
const Point = require('../utils/point');
const MiraEditorBase = require('./base-view');

class MiraMenu extends MiraEditorBase {
  static TAG = 'mira-editor-menu';

  init() {
    this.addClass('mirae-menu');
    return super.init();
  }

  addItem(item) {
    const menuItem = document.createElement('div');
    this.append(menuItem);
    if (typeof(item) !== 'object') return menuItem.classList.add('mirae-menu-line');
    const keys = item.keys || [];
    menuItem.innerHTML = `
      <div class="mirae-menu-item-title">${item.title}</div>
      <div class="mirae-menu-item-keys">${keys.map(k => `<div>${k}</div>`).join('')}</div>
    `;
    menuItem.classList.add('mirae-menu-item');
    if (item.enable === false) {
      menuItem.classList.add('mirae-menu-item-disable');
    }
    menuItem.addEventListener('click', (e) => {
      e.preventDefault();
      item.click && item.click(e);
      this.remove();
    });
  }

  setMenu(menu) {
    for (const item of menu) {
      this.addItem(item);
    }
    return this;
  }

  setPosition(e) {
    const parent = this.parentNode;
    const point = new Point(e).rebase(parent);
    const pr = parent.getBoundingClientRect();
    const r = this.getBoundingClientRect();
    const styles = { opacity: 1 };
    if (pr.width - (point.x - parent.scrollLeft) > r.width + 15) {
      styles.left = `${point.x}px`;
    } else {
      styles.left = `${point.x - r.width}px`;
    }
    if (pr.height - (point.y - parent.scrollTop) > r.height + 15) {
      styles.top = `${point.y}px`;
    } else {
      styles.top = `${point.y - r.height}px`;
    }
    this.setStyle(styles);
    return this;
  }

  remove() {
    this.setStyle({ opacity: 0 });
    return this.lock(300, () => super.remove(), 'remove');
  }

  static create(opts) {
    const { parent, menu, event } = opts;
    return super.create(parent).setMenu(menu).setPosition(event);
  }
}

MiraMenu.register();
module.exports = MiraMenu;