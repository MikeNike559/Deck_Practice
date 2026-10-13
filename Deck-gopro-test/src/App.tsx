import { useEffect, useState, type ChangeEvent } from 'react'
import DeckGL from '@deck.gl/react'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
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

const imageAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

function UploadOptions({
  onChange,
}: {
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setIsOpen(false)
    onChange(event)
  }

  return (
    <>
      <button className="upload-button" type="button" onClick={() => setIsOpen(true)}>
        Upload images or folder
      </button>

      {isOpen && (
        <div className="upload-modal-backdrop" role="presentation">
          <div
            className="upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-modal-title"
          >
            <div className="upload-modal-header">
              <div>
                <p className="eyebrow">Add files</p>
                <h2 id="upload-modal-title">Upload images</h2>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close upload options"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="upload-modal-copy">
              Select multiple images from your phone or choose a folder on a desktop browser.
            </p>

            <div className="upload-options">
              <label className="upload-option">
                <strong>Select images</strong>
                <span>Choose multiple photos from your library or files.</span>
                <input
                  type="file"
                  accept={imageAccept}
                  multiple
                  onChange={handleChange}
                />
              </label>

              <label className="upload-option">
                <strong>Select image folder</strong>
                <span>Available on desktop browsers that support folder selection.</span>
                <input
                  type="file"
                  accept={imageAccept}
                  multiple
                  onChange={handleChange}
                  ref={(input) => input?.setAttribute('webkitdirectory', '')}
                />
              </label>
            </div>

            <button
              className="modal-cancel-button"
              type="button"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const [imageLocations, setImageLocations] = useState<ImageLocation[]>([])
  const [status, setStatus] = useState('')
  const [isMapExpanded, setIsMapExpanded] = useState(false)

  useEffect(() => {
    return () => {
      imageLocations.forEach((location) => URL.revokeObjectURL(location.previewUrl))
    }
  }, [imageLocations])

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )
    event.target.value = ''
    if (files.length === 0) return

    setStatus(`Reading GPS metadata from ${files.length} image${files.length === 1 ? '' : 's'}...`)

    const locations = await Promise.all(
      files.map(async (file) => {
        try {
          const coordinates = await gps(file)
          if (
            !coordinates ||
            typeof coordinates.latitude !== 'number' ||
            typeof coordinates.longitude !== 'number'
          ) {
            return null
          }

          return {
            id: `${file.name}-${file.lastModified}`,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            fileName: file.name,
            previewUrl: URL.createObjectURL(file),
          }
        } catch {
          return null
        }
      }),
    )

    const validLocations = locations.filter(
      (location): location is ImageLocation => location !== null,
    )
    setImageLocations(validLocations)
    setStatus(
      validLocations.length === 0
        ? 'No GPS coordinates were found in the selected images.'
        : `${validLocations.length} image${validLocations.length === 1 ? '' : 's'} mapped. ${files.length - validLocations.length} skipped without GPS data.`,
    )
  }

  if (imageLocations.length === 0) {
    return (
      <main className="page">
        <section className="workspace" aria-labelledby="map-title">
          <aside className="files-panel">
            <div>
              <p className="eyebrow">Files</p>
              <h1>Image files</h1>
            </div>

            <div className="file-list file-list-empty">
              <p>Choose an image folder to begin.</p>
              <span>
                Every image with GPS metadata will get its own pin.
              </span>
            </div>

            <UploadOptions onChange={handleImageChange} />
            {status && <p className="status-message">{status}</p>}
          </aside>

          <section className="map-panel" aria-labelledby="map-title">
            <div className="map-header">
              <div>
                <p className="eyebrow">Map view</p>
                <h2 id="map-title">Where were the images taken?</h2>
              </div>
            </div>
            <div className="map-wrapper map-wrapper-empty">
              <div className="empty-map-message">
                <span aria-hidden="true">⌖</span>
                <p>Your image locations will appear here.</p>
              </div>
            </div>
          </section>
        </section>
      </main>
    )
  }

  const center = imageLocations.reduce(
    (sum, location) => ({
      latitude: sum.latitude + location.latitude / imageLocations.length,
      longitude: sum.longitude + location.longitude / imageLocations.length,
    }),
    { latitude: 0, longitude: 0 },
  )

  const initialViewState: ViewState = {
    longitude: center.longitude,
    latitude: center.latitude,
    zoom: imageLocations.length === 1 ? 11 : 5,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  }

  const layers = [
    new HeatmapLayer<ImageLocation>({
      id: 'image-location-heatmap',
      data: imageLocations,
      getPosition: (location) => [location.longitude, location.latitude],
      getWeight: () => 1,
      radiusPixels: 60,
      intensity: 1,
      threshold: 0.05,
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
            {imageLocations.map((location) => (
              <div className="file-item" key={location.id}>
                <img src={location.previewUrl} alt="" />
                <div>
                  <strong>{location.fileName}</strong>
                  <p>GPS location found</p>
                </div>
              </div>
            ))}
          </div>

          <UploadOptions onChange={handleImageChange} />
          <p className="status-message">{status}</p>
        </aside>

        <section className="map-panel" aria-labelledby="map-title">
          <div className="map-header">
            <div>
              <p className="eyebrow">Map view</p>
              <h2 id="map-title">Where were the images taken?</h2>
            </div>
            <span className="location-badge">
              {imageLocations.length} image{imageLocations.length === 1 ? '' : 's'}
            </span>
          </div>

          <div
            id="map-content"
            className={`map-wrapper${isMapExpanded ? ' map-wrapper-expanded' : ''}`}
          >
            <DeckGL
              initialViewState={initialViewState}
              controller
              layers={layers}
              style={{ width: '100%', height: '100%' }}
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

            <div className="map-controls" aria-label="Map display controls">
              <button
                className="map-toggle"
                type="button"
                aria-controls="map-content"
                aria-expanded={isMapExpanded}
                onClick={() => setIsMapExpanded(true)}
              >
                Expand map
              </button>
              <button
                className="map-toggle"
                type="button"
                aria-controls="map-content"
                aria-expanded={isMapExpanded}
                onClick={() => setIsMapExpanded(false)}
              >
                Collapse map
              </button>
            </div>
          </div>

          <p className="map-caption">
            {imageLocations.length} pin{imageLocations.length === 1 ? '' : 's'} shown.
          </p>
        </section>
      </section>
    </main>
  )
}

export default App
