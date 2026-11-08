import * as THREE from 'three';

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain copy of the sculpt geometry without the BVH, for exporters. */
function exportMesh(mesh) {
  const g = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', g.attributes.position.clone());
  geo.setAttribute('normal', g.attributes.normal.clone());
  geo.setAttribute('color', g.attributes.color.clone());
  geo.setIndex(g.index.clone());
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'Sculpt';
  return m;
}

export async function exportModel(kind, mesh, basename) {
  const m = exportMesh(mesh);
  if (kind === 'glb') {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const result = await new GLTFExporter().parseAsync(m, { binary: true });
    download(new Blob([result], { type: 'model/gltf-binary' }), `${basename}.glb`);
  } else if (kind === 'obj') {
    const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js');
    download(new Blob([new OBJExporter().parse(m)], { type: 'text/plain' }), `${basename}.obj`);
  } else if (kind === 'stl') {
    const { STLExporter } = await import('three/addons/exporters/STLExporter.js');
    const data = new STLExporter().parse(m, { binary: true });
    download(new Blob([data], { type: 'model/stl' }), `${basename}.stl`);
  }
  m.geometry.dispose();
  m.material.dispose();
}
