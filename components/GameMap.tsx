'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

// Default view: University of Waterloo. The map recentres on real positions as soon as they exist.
const DEFAULT_CENTER: L.LatLngExpression = [43.4723, -80.5449];

export type MarkerTone = 'fresh' | 'stale' | 'caught' | 'self';

export interface MapMarker {
  id: string;
  label: string;
  sub?: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  tone: MarkerTone;
  trail: { lat: number; lng: number }[];
}

export interface MapCommand {
  kind: 'fit' | 'me' | 'point';
  lat?: number;
  lng?: number;
  n: number;
}

interface Props {
  me: { lat: number; lng: number; accuracy: number } | null;
  markers: MapMarker[];
  command: MapCommand | null;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TONE_COLOR: Record<MarkerTone, string> = {
  fresh: '#C8177E',
  stale: '#7E8A80',
  caught: '#B7BDB4',
  self: '#15261F',
};

export default function GameMap({ me, markers, command }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const latest = useRef({ me, markers });
  latest.current = { me, markers };

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true }).setView(DEFAULT_CENTER, 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    markerLayer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    // Containers inside flex layouts can measure 0 on first paint (esp. iOS); re-measure.
    const t = setTimeout(() => {
      m.invalidateSize();
      if (fitted.current) fitAll();
    }, 200);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
  }, []);

  const fitAll = () => {
    const m = map.current;
    if (!m) return;
    const pts: L.LatLngExpression[] = latest.current.markers.map((x) => [x.lat, x.lng]);
    if (latest.current.me) pts.push([latest.current.me.lat, latest.current.me.lng]);
    if (pts.length === 1) m.setView(pts[0], 17);
    else if (pts.length > 1) {
      // Keep pins clear of the HUD (top) and the bottom sheet / side panel that overlay the map.
      const wide = window.innerWidth >= 700;
      m.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [40, wide ? 60 : 170],
        // Extra right padding leaves room for the name labels that sit to the right of each pin.
        paddingBottomRight: wide ? [500, 40] : [140, Math.round(window.innerHeight * 0.46) + 30],
        maxZoom: 18,
      });
    }
  };

  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const mk of markers) {
      const color = TONE_COLOR[mk.tone];
      if (mk.trail.length) {
        const path: L.LatLngExpression[] = [[mk.lat, mk.lng], ...mk.trail.map((p) => [p.lat, p.lng] as L.LatLngTuple)];
        L.polyline(path, { color, weight: 3, opacity: 0.55, dashArray: '2 7', lineCap: 'round' }).addTo(layer);
        mk.trail.forEach((p, i) =>
          L.circleMarker([p.lat, p.lng], {
            radius: 4,
            color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.45 - i * 0.12,
            opacity: 0.6 - i * 0.15,
          }).addTo(layer),
        );
      }
      if (mk.accuracy && mk.accuracy < 500) {
        L.circle([mk.lat, mk.lng], { radius: mk.accuracy, color, weight: 1, opacity: 0.4, fillOpacity: 0.08 }).addTo(
          layer,
        );
      }
      L.marker([mk.lat, mk.lng], {
        icon: L.divIcon({
          className: 'pin',
          iconSize: [0, 0],
          html: `<div class="pin__dot pin__dot--${mk.tone}"></div><div class="pin__label"><b>${esc(mk.label)}</b>${
            mk.sub ? `<span>${esc(mk.sub)}</span>` : ''
          }</div>`,
        }),
        zIndexOffset: mk.tone === 'fresh' ? 1000 : 0,
      }).addTo(layer);
    }
    if (!fitted.current && markers.length) {
      fitted.current = true;
      fitAll();
    }
  }, [markers]);

  useEffect(() => {
    const layer = meLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!me) return;
    if (me.accuracy < 500) {
      L.circle([me.lat, me.lng], { radius: me.accuracy, color: '#2B7BC0', weight: 1, opacity: 0.4, fillOpacity: 0.1 }).addTo(
        layer,
      );
    }
    L.marker([me.lat, me.lng], {
      icon: L.divIcon({ className: 'pin', iconSize: [0, 0], html: '<div class="pin__me"></div>' }),
      zIndexOffset: 2000,
      interactive: false,
    }).addTo(layer);
    if (!fitted.current) {
      fitted.current = true;
      map.current?.setView([me.lat, me.lng], 17);
    }
  }, [me]);

  useEffect(() => {
    const m = map.current;
    if (!command || !m) return;
    if (command.kind === 'fit') fitAll();
    else if (command.kind === 'me' && latest.current.me) m.setView([latest.current.me.lat, latest.current.me.lng], 18);
    else if (command.kind === 'point' && command.lat != null && command.lng != null) m.setView([command.lat, command.lng], 18);
  }, [command]);

  return <div ref={el} className="map" />;
}
