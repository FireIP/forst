// Drag & Drop Logik & Persistenz der manuellen Reihenfolge
import {settings} from './constants.js';
import {runtime} from './state.js';

function onDragOverPreventDefault(e) {
    e.preventDefault();
}

export function enableDraggingOnAllCards() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.querySelectorAll('.card').forEach(c => {
        c.setAttribute('draggable', 'true');
        attachCardDragHandlers(c);
    });
    document.body.addEventListener('dragover', onDragOverPreventDefault);
}

export function disableDraggingOnAllCards() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.querySelectorAll('.card').forEach(c => {
        c.removeAttribute('draggable');
        detachCardDragHandlers(c);
    });
    document.body.removeEventListener('dragover', onDragOverPreventDefault);
}

function attachCardDragHandlers(card) {
    if (card._dragHandlersAttached) return;
    card._dragHandlersAttached = true;
    const grid = document.getElementById('grid');
    const onDragStart = e => {
        runtime.dragSrcEl = card;
        card.classList.add('dragging');
        try {
            e.dataTransfer.setData('text/plain', card.dataset.streamId || '');
        } catch (_) {
        }
        e.dataTransfer.effectAllowed = 'move';
    };
    const onDragEnd = () => {
        if (card) card.classList.remove('dragging');
        runtime.dragSrcEl = null;
    };
    const onDrop = e => {
        e.preventDefault();
        if (!runtime.dragSrcEl || runtime.dragSrcEl === card) return;
        const afterEl = getDragAfterElement(grid, e.clientY);
        if (afterEl == null) grid.appendChild(runtime.dragSrcEl); else grid.insertBefore(runtime.dragSrcEl, afterEl);
        saveManualOrder();
    };
    const onDragOver = e => e.preventDefault();
    card._onDragStart = onDragStart;
    card._onDragEnd = onDragEnd;
    card._onDrop = onDrop;
    card._onDragOver = onDragOver;
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
    card.addEventListener('drop', onDrop);
    card.addEventListener('dragover', onDragOver);
}

function detachCardDragHandlers(card) {
    if (!card._dragHandlersAttached) return;
    try {
        ['dragstart', 'dragend', 'drop', 'dragover'].forEach(ev => {
            const h = card[`_on${ev.charAt(0).toUpperCase() + ev.slice(1)}`];
            if (h) card.removeEventListener(ev, h);
        });
    } catch (_) {
    }
    delete card._onDragStart;
    delete card._onDragEnd;
    delete card._onDrop;
    delete card._onDragOver;
    card._dragHandlersAttached = false;
}

function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.card:not(.dragging)')];
    let closest = null, offsetMax = Number.NEGATIVE_INFINITY;
    for (const el of els) {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset > offsetMax) {
            offsetMax = offset;
            closest = el;
        }
    }
    if (!closest) return null;
    return (offsetMax < 0) ? closest : closest.nextElementSibling;
}

export function saveManualOrder() {
    try {
        const grid = document.getElementById('grid');
        if (!grid) return;
        const order = [...grid.querySelectorAll('.card')].map(c => c.dataset.streamId);
        localStorage.setItem(settings.LS_MANUAL_ORDER, JSON.stringify(order));
    } catch (_) {
    }
}

export function loadManualOrder() {
    try {
        const raw = localStorage.getItem(settings.LS_MANUAL_ORDER);
        if (!raw) return null;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : null;
    } catch (_) {
        return null;
    }
}

export function applyManualOrderIfExists() {
    const grid = document.getElementById('grid');
    if (!grid) return false;
    const order = loadManualOrder();
    if (!order) return false;
    const mapping = {};
    [...grid.querySelectorAll('.card')].forEach(c => mapping[c.dataset.streamId] = c);
    order.forEach(id => {
        if (mapping[id]) grid.appendChild(mapping[id]);
    });
    settings.streams.forEach(s => {
        if (!order.includes(s.id) && mapping[s.id]) grid.appendChild(mapping[s.id]);
    });
    return true;
}
