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
  color: string
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

const pinColors = ['#d83232', '#2864d7', '#159447', '#d47b16', '#8b45c7', '#d13f91']
const pinIconCache = new globalThis.Map<
  string,
  { url: string; width: number; height: number; anchorY: number }
>()

function getPinIcon(color: string) {
  const cachedIcon = pinIconCache.get(color)
  if (cachedIcon) return cachedIcon

  const icon = {
    url: `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="60" viewBox="0 0 48 60">
        <path d="M24 58S4 37.5 4 23.5C4 12.7 12.95 4 24 4s20 8.7 20 19.5C44 37.5 24 58 24 58Z" fill="${color}" stroke="#ffffff" stroke-width="3"/>
        <circle cx="24" cy="23" r="7" fill="#ffffff"/>
      </svg>
    `)}`,
    width: 48,
    height: 60,
    anchorY: 60,
  }
  pinIconCache.set(color, icon)
  return icon
}

const imageAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

function DirectoryInput({
  onChange,
  label,
}: {
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  label: string
}) {
  return (
    <label className="upload-button">
      {label}
      <input
        type="file"
        accept={imageAccept}
        multiple
        onChange={onChange}
        ref={(input) => input?.setAttribute('webkitdirectory', '')}
      />
    </label>
  )
}

function App() {
  const [imageLocations, setImageLocations] = useState<ImageLocation[]>([])
  const [status, setStatus] = useState('')

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
      files.map(async (file, index) => {
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
            color: pinColors[index % pinColors.length],
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
                Every image with GPS metadata will get its own colored pin.
              </span>
            </div>

            <DirectoryInput onChange={handleImageChange} label="Choose image folder" />
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
    new IconLayer<ImageLocation>({
      id: 'image-location-pins',
      data: imageLocations,
      getPosition: (location) => [location.longitude, location.latitude],
      getIcon: (location) => getPinIcon(location.color),
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
            {imageLocations.map((location) => (
              <div className="file-item" key={location.id}>
                <img src={location.previewUrl} alt="" />
                <div>
                  <strong>{location.fileName}</strong>
                  <p style={{ color: location.color }}>GPS location found</p>
                </div>
              </div>
            ))}
          </div>

          <DirectoryInput onChange={handleImageChange} label="Choose image folder" />
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
            {imageLocations.length} colored pin{imageLocations.length === 1 ? '' : 's'} shown.
          </p>
        </section>
      </section>
    </main>
  )
}

export default App
