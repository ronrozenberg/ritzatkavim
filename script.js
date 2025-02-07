        const map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
        let userMarker;
        let randomMarker;
        let userPosition;
        let randomPosition;
        let countdownInterval;
        let routeLayer = null;
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        function showStatus(message) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.style.display = 'block';
        }

        function hideStatus() {
            document.getElementById('status').style.display = 'none';
        }

        async function fetchTransitStops(lat, lon, radius) {
            const query = `
                [out:json][timeout:25];
                (
                    node["highway"="bus_stop"](around:${radius * 1000},${lat},${lon});
                    node["public_transport"="platform"](around:${radius * 1000},${lat},${lon});
                    node["public_transport"="stop_position"](around:${radius * 1000},${lat},${lon});
                );
                out body;
                >;
                out skel qt;
            `;

            try {
                const response = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: query
                });
                
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                
                const data = await response.json();
                return data.elements.filter(elem => elem.type === 'node');
            } catch (error) {
                console.error('Error fetching transit stops:', error);
                throw error;
            }
        }

        function getRandomLocation(center, radius) {
            const radiusInDegrees = radius / 111.32;
            const randomAngle = Math.random() * 2 * Math.PI;
            const randomRadius = Math.sqrt(Math.random()) * radiusInDegrees;
            const newLat = center[0] + (randomRadius * Math.cos(randomAngle));
            const newLng = center[1] + (randomRadius * Math.sin(randomAngle));
            return [newLat, newLng];
        }
        
        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                     Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        function findNearestStop(stops, lat, lng, maxDistance = 0.1) {
            let nearest = null;
            let minDist = maxDistance;
            
            for (const stop of stops) {
                const dist = getDistance(lat, lng, stop.lat, stop.lon);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = stop;
                }
            }
            
            return nearest;
        }
        
        async function showRandomLocation(radius) {
            // Remove existing route if any
            
            if (!userPosition) {
                alert("אנא אשר גישה למיקום שלך תחילה");
                return;
            }
            
            showStatus('מחפש מיקום מתאים...');
            
            try {
                if (randomMarker) {
                    map.removeLayer(randomMarker);
                }

                const stops = await fetchTransitStops(userPosition.lat, userPosition.lng, radius);
                
                let validLocation = null;
                let nearestStop = null;
                let attempts = 0;
                const maxAttempts = 50;

                while (!validLocation && attempts < maxAttempts) {
                    const location = getRandomLocation([userPosition.lat, userPosition.lng], radius);
                    const stop = findNearestStop(stops, location[0], location[1]);
                    
                    if (stop) {
                        validLocation = [stop.lat, stop.lon];
                        nearestStop = stop;
                        createRoute()
                        break;
                    }
                    attempts++;
                }

                if (!validLocation) {
                    showStatus('לא נמצא מיקום מתאים ליד תחבורה ציבורית');
                    setTimeout(hideStatus, 2000);
                    return;
                }

                randomPosition = validLocation;
                
                randomMarker = L.marker(randomPosition).addTo(map);
                const stopName = nearestStop.tags ? (nearestStop.tags.name || 'תחנה ללא שם') : 'תחנת אוטובוס';
                randomMarker.bindPopup(`תחנה קרובה: ${stopName}`).openPopup();
                createRoute();
                const circle = L.circle([userPosition.lat, userPosition.lng], {
                    color: 'blue',
                    fillColor: '#30f',
                    fillOpacity: 0.1,
                    radius: radius * 1000
                }).addTo(map);
                
                const bounds = L.latLngBounds([
                    [userPosition.lat, userPosition.lng],
                    randomPosition
                ]).pad(0.1);
                map.fitBounds(bounds);
                
                setTimeout(() => {
                    map.removeLayer(circle);
                }, 2000);
                

                hideStatus();
                } catch (error) {
                    console.error('Error:', error);
                    showStatus('שגיאה במציאת מיקום. אנא נסה שוב');
                    setTimeout(hideStatus, 2000);
                }
            }
        async function createRoute() {
            if (!userPosition || !randomPosition) {
                return;
            }
            
            
            try {
                if (routeLayer) {
                    map.removeLayer(routeLayer);
                    routeLayer = null; // Reset it
                    console.log("Removing routeLayer:", routeLayer);
                    console.log("Layer exists in map?", map.hasLayer(routeLayer));
                }
                // Fetch route from OSRM
                const response = await fetch(
                    `https://router.project-osrm.org/route/v1/driving/${userPosition.lng},${userPosition.lat};${randomPosition[1]},${randomPosition[0]}?overview=full&geometries=geojson`
                );
                const data = await response.json();
                
                if (data.routes && data.routes.length > 0) {
                    // Draw route on map
                    routeLayer = L.geoJSON(data.routes[0].geometry, {
                        style: {
                            color: '#3388ff',
                            weight: 6,
                            opacity: 0.6
                        }
                    }).addTo(map);
                    
                    // Show route information
                    const distance = (data.routes[0].distance / 1000).toFixed(2);
                    const durationm = ((data.routes[0].duration*2)/60).toFixed(0);
                    const durations = ((data.routes[0].duration*2)%60).toFixed(0);
                    durationx = data.routes[0].duration;
                    const routeInfo = document.getElementById('routeInfo');
                    if(durations < 10) {
                        routeInfo.innerHTML = `זמן לנצח: ${durationm}:0${durations}`;
                    } else routeInfo.innerHTML = `זמן לנצח: ${durationm}:${durations}`;
                    routeInfo.style.display = 'block';
                    
                    // Fit map to show entire route
                    map.fitBounds(randomMarker.getBounds(), { padding: [150, 150] });
                }
            } catch (error) {
                console.error(error);
            }
        }
        
        function startCountdown() {
            // Clear any existing countdown
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
        
            const timerElement = document.getElementById('timer');
            let timeLeft = durationx * 2;
        
            function updateTimer() {
                if (timeLeft < 0) {  
                    clearInterval(countdownInterval);
                    timerElement.style.display = 'none';
                    return;
                }
        
                const hours = Math.floor(timeLeft / 3600);
                let minutes = Math.floor((timeLeft % 3600) / 60);
                const seconds = ((timeLeft % 3600) % 60);

                timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${Math.floor(seconds).toString().padStart(2, '0')}`;
        
                timeLeft--;
            }
        
            timerElement.style.display = 'block';
            updateTimer();
            countdownInterval = setInterval(updateTimer, 1000);
        }
        
        function openInGoogleMaps() {
            if (!userPosition || !randomPosition) {
                alert("אנא בחר מיקום אקראי תחילה");
                return;
            }
            
            const url = `https://www.google.com/maps/dir/?api=1&origin=${userPosition.lat},${userPosition.lng}&destination=${randomPosition[0]},${randomPosition[1]}`;
            window.open(url, '_blank');
        }

        function openInMoovit() {
            if (!userPosition || !randomPosition) {
                alert("אנא בחר מיקום אקראי תחילה");
                return;
            }
            
            const appUrl = `moovit://directions?dest_lat=${randomPosition[0]}&dest_lon=${randomPosition[1]}&orig_lat=${userPosition.lat}&orig_lon=${userPosition.lng}&auto_run=true`;
            window.location.href = appUrl;
        }
        
        function locateUser() {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(function(position) {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    userPosition = { lat, lng: lon };
                    
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    
                    userMarker = L.marker([lat, lon]).addTo(map);
                    userMarker.bindPopup("אתה כאן!").openPopup();
                    
                    map.setView([lat, lon], 15);
                }, function(error) {
                    alert("Error getting location: " + error.message);
                });
            } else {
                alert("Geolocation is not supported by your browser");
            }
        }
        
        // Initial location request
        locateUser();