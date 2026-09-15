// Simple k6 load test script
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.get('http://localhost:5173/');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
