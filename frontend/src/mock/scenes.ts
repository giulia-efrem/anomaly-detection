import type { SceneSpec } from '../components/Scene'

// Placeholder pictures for the mock cameras and incidents. Not part of the
// event contract: once real streams exist these are replaced by video frames.

const workshopFight: SceneSpec = {
  backdrop: 'workshop',
  people: [
    { pose: 'punch', x: 80, y: 68, h: 34, group: 'fight', alarm: true },
    { pose: 'recoil', x: 94, y: 68, h: 34, group: 'fight', alarm: true },
    { pose: 'run', x: 134, y: 64, h: 28, flip: true },
    { pose: 'stand', x: 36, y: 54, h: 22 },
  ],
}

export const cameraScenes: Record<string, SceneSpec> = {
  cam5: workshopFight,
  cam1: { backdrop: 'crossing', people: [] },
  cam2: { backdrop: 'sidewalk', people: [{ pose: 'walk', x: 54, y: 68, h: 28 }] },
  cam3: {
    backdrop: 'bar',
    people: [
      { pose: 'stand', x: 112, y: 54, h: 30 },
      { pose: 'perch', x: 64, y: 72, h: 30 },
    ],
  },
  cam4: { backdrop: 'porch', people: [{ pose: 'carry', x: 70, y: 70, h: 34 }] },
  'cam-201-a': {
    backdrop: 'plaza',
    people: [
      { pose: 'walk', x: 40, y: 60, h: 22 },
      { pose: 'stand', x: 66, y: 46, h: 16 },
      { pose: 'walk', x: 88, y: 70, h: 28, flip: true },
      { pose: 'stand', x: 140, y: 56, h: 20 },
    ],
  },
  'cam-204-a': { backdrop: 'parking', people: [] },
}

export const incidentScenes: Record<string, SceneSpec> = {
  'inc-0141': workshopFight,
  'inc-0140': {
    backdrop: 'porch',
    people: [{ pose: 'fall', x: 70, y: 86, h: 60, alarm: true }],
    props: [
      { kind: 'package', x: 104, y: 74, w: 13, h: 9 },
      { kind: 'package', x: 116, y: 80, w: 10, h: 8 },
    ],
  },
  'inc-0139': {
    backdrop: 'sidewalk',
    people: [{ pose: 'lie', x: 66, y: 80, h: 56, alarm: true }],
  },
  'inc-0138': {
    backdrop: 'bar',
    people: [
      { pose: 'crouch', x: 66, y: 60, h: 30 },
      { pose: 'crouch', x: 88, y: 59, h: 30, flip: true },
    ],
  },
}
