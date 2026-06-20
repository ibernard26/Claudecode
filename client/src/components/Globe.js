import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';

const Globe = forwardRef((props, ref) => {
  const mountRef = useRef();
  const meshRef = useRef();

  useImperativeHandle(ref, () => ({
    pulse: () => {
      if (meshRef.current) {
        meshRef.current.userData.pulseTime = 0.0;
      }
    }
  }));

  useEffect(() => {
    const width = 380;
    const height = 380;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0x333344, 0.6));

    const geometry = new THREE.SphereGeometry(1.2, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0x113355,
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0x002244,
      emissiveIntensity: 0.08
    });

    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    mesh.userData.pulseTime = 999;
    scene.add(mesh);

    function animate(time) {
      requestAnimationFrame(animate);
      mesh.rotation.y += 0.0025;
      const pt = mesh.userData.pulseTime;
      if (pt < 1.0) {
        const scale = 1.0 + Math.sin(pt * Math.PI) * 0.08;
        mesh.scale.setScalar(scale);
        mesh.material.emissiveIntensity = 0.08 + Math.sin(pt * Math.PI) * 0.8;
        mesh.userData.pulseTime += 0.02;
      } else {
        mesh.material.emissiveIntensity = 0.08;
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: 380, height: 380 }} />;
});

export default Globe;
