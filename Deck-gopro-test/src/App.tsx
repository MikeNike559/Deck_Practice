import { useEffect, useState, type ChangeEvent } from 'react'
import DeckGL from '@deck.gl/react'
import { IconLayer } from '@deck.gl/layers'
import { gps } from 'exifr'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Map } from 'react-map-gl/maplibre'
import type { ViewState } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

type ImageLocation = {
  id: string
  longitude: number
  latitude: number
  fileName: string
  previewUrl: string
}

const mapStyle = {
  version: 8 as const,
  sources: {
    openstreetmap: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openstreetmap',
      type: 'raster' as const,
      source: 'openstreetmap',
    },
  ],
}

const pinIcon = {
  url: `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="60" viewBox="0 0 48 60">
      <path d="M24 58S4 37.5 4 23.5C4 12.7 12.95 4 24 4s20 8.7 20 19.5C44 37.5 24 58 24 58Z" fill="#d83232" stroke="#ffffff" stroke-width="3"/>
      <circle cx="24" cy="23" r="7" fill="#ffffff"/>
    </svg>
  `)}`,
  width: 48,
  height: 60,
  anchorY: 60,
}

function App() {
  const [imageLocation, setImageLocation] = useState<ImageLocation | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    return () => {
      if (imageLocation?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageLocation.previewUrl)
      }
    }
  }, [imageLocation])

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus('Reading GPS metadata...')

    try {
      const coordinates = await gps(file)
      if (
        !coordinates ||
        typeof coordinates.latitude !== 'number' ||
        typeof coordinates.longitude !== 'number'
      ) {
        setStatus('No GPS coordinates were found in this image.')
        return
      }

      setImageLocation({
        id: `${file.name}-${file.lastModified}`,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
      })
      setStatus('GPS coordinates loaded from the image.')
    } catch {
      setStatus('Could not read this image’s EXIF metadata.')
    }
  }

  if (!imageLocation) {
    return (
      <main className="page">
        <section className="workspace" aria-labelledby="map-title">
          <aside className="files-panel">
            <div>
              <p className="eyebrow">Files</p>
              <h1>Image files</h1>
            </div>

            <div className="file-list file-list-empty">
              <p>Choose an image to begin.</p>
              <span>
                Select a photo with GPS metadata and we&apos;ll place it on the
                map.
              </span>
            </div>

            <label className="upload-button">
              Choose image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handleImageChange}
              />
            </label>
            {status && <p className="status-message">{status}</p>}
          </aside>

          <section className="map-panel" aria-labelledby="map-title">
            <div className="map-header">
              <div>
                <p className="eyebrow">Map view</p>
                <h2 id="map-title">Where was this image taken?</h2>
              </div>
            </div>
            <div className="map-wrapper map-wrapper-empty">
              <div className="empty-map-message">
                <span aria-hidden="true">⌖</span>
                <p>Your image location will appear here.</p>
              </div>
            </div>
          </section>
        </section>
      </main>
    )
  }

  const initialViewState: ViewState = {
    longitude: imageLocation.longitude,
    latitude: imageLocation.latitude,
    zoom: 11,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  }

  const layers = [
    new IconLayer<ImageLocation>({
      id: 'image-location-pin',
      data: [imageLocation],
      getPosition: (location) => [location.longitude, location.latitude],
      getIcon: () => pinIcon,
      getSize: 48,
      sizeScale: 1,
      pickable: true,
    }),
  ]

  return (
    <main className="page">
      <section className="workspace" aria-labelledby="map-title">
        <aside className="files-panel">
          <div>
            <p className="eyebrow">Files</p>
            <h1>Image files</h1>
          </div>

          <div className="file-list">
            <div className="file-item file-item-selected">
              <img src={imageLocation.previewUrl} alt="" />
              <div>
                <strong>{imageLocation.fileName}</strong>
                <p>GPS location found</p>
              </div>
            </div>
          </div>

          <label className="upload-button">
            Add another image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleImageChange}
            />
          </label>
        </aside>

        <section className="map-panel" aria-labelledby="map-title">
          <div className="map-header">
            <div>
              <p className="eyebrow">Map view</p>
              <h2 id="map-title">Where was this image taken?</h2>
            </div>
            <span className="location-badge">1 image</span>
          </div>

          <div className="map-wrapper">
            <DeckGL
              initialViewState={initialViewState}
              controller
              layers={layers}
              getTooltip={({ object }) =>
                object ? { text: object.fileName } : null
              }
            >
              <Map
                mapLib={maplibregl}
                mapStyle={mapStyle}
                attributionControl={{}}
              />
            </DeckGL>
          </div>

          <p className="map-caption">
            Pin location: {imageLocation.latitude.toFixed(6)},{' '}
            {imageLocation.longitude.toFixed(6)}
          </p>
        </section>
      </section>
    </main>
  )
}

export default App
