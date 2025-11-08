// DOM-Erzeugung des Stream-Grids
import {runtime} from './state.js';
import {settings} from './constants.js';
import {activateCard, restoreThumbnail} from './player.js';
import {applyManualOrderIfExists, disableDraggingOnAllCards, enableDraggingOnAllCards} from './drag.js';

export function createGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML = '';
    settings.streams.forEach((s, idx) => {
        runtime.savedThumbSrc[s.id] = s.thumb;
        runtime.liveCounters[s.id] = 0;

        const card = document.createElement('div');
        card.className = 'card h-90';
        card.dataset.streamId = s.id;
        card.dataset.streamLabel = s.label;
        card.dataset.streamIndex = idx;
        card.dataset.isLive = 'false';

        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'media-wrap';
        const inner = document.createElement('div');
        inner.className = 'media-inner';
        const img = document.createElement('img');
        img.className = 'thumb-img';
        img.src = s.thumb;
        img.alt = s.label + ' preview';
        img.setAttribute('data-stream-id', s.id);
        img.addEventListener('click', () => activateCard(s, card));
        inner.appendChild(img);
        mediaWrap.appendChild(inner);

        const badge = document.createElement('span');
        badge.className = 'badge bg-dark status-badge';
        badge.textContent = 'Offline';
        mediaWrap.appendChild(badge);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-sm btn-dark closeBtnCard';
        closeBtn.textContent = 'Close';
        closeBtn.style.display = 'none';
        closeBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            restoreThumbnail(card, s.id);
        });
        mediaWrap.appendChild(closeBtn);

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body d-flex justify-content-between align-items-center p-2';
        const title = document.createElement('h5');
        title.className = 'card-title mb-0 h6';
        title.textContent = s.label;
        const playBtn = document.createElement('button');
        playBtn.className = 'btn btn-sm btn-primary';
        playBtn.textContent = 'Play';
        playBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            activateCard(s, card);
        });
        cardBody.appendChild(title);
        cardBody.appendChild(playBtn);

        card.appendChild(mediaWrap);
        card.appendChild(cardBody);
        grid.appendChild(card);
    });

    if (!runtime.autoSort) applyManualOrderIfExists();
    if (runtime.autoSort) disableDraggingOnAllCards(); else enableDraggingOnAllCards();
}
