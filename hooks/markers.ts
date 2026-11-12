import type { Marker, Sample } from '../types'
import { shortModel } from './timeline'

/** Markers kept (same cap as samples). */
export const MARKER_CAP = 200

export function addMarker(list: readonly Marker[], marker: Marker): Marker[] {
  return [...list, marker].slice(-MARKER_CAP)
}

/**
 * A model change between two consecutive main-thread requests, detected from
 * the `model` field: no host event is assumed for it.
 */
export function modelChange(prevModel: string | null | undefined, cur: Sample): Marker | null {
  if (prevModel === undefined || prevModel === null || cur.agentId !== undefined) return null
  if (prevModel === cur.model) return null
  return { kind: 'model', at: cur.at, detail: `${shortModel(prevModel)} to ${shortModel(cur.model)}` }
}

export type Item =
  | { kind: 'sample'; at: number; sample: Sample }
  | { kind: 'marker'; at: number; marker: Marker }

/** Samples and markers merged, newest first; on a tie the sample is listed first because the marker happened before that request. */
export function mergeItems(samples: readonly Sample[], markers: readonly Marker[]): Item[] {
  const items: Item[] = [
    ...samples.map(sample => ({ kind: 'sample' as const, at: sample.at, sample })),
    ...markers.map(marker => ({ kind: 'marker' as const, at: marker.at, marker })),
  ]
  return items.sort((a, b) => b.at - a.at || (a.kind === 'marker' ? 1 : 0) - (b.kind === 'marker' ? 1 : 0))
}
