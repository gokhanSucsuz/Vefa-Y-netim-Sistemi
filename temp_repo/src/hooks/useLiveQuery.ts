import { useState, useEffect, useRef } from 'react';
import { subscribeToDbChanges } from '../services/dbService';

export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: any[] = []): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const querierRef = useRef(querier);

  useEffect(() => {
    querierRef.current = querier;
  }, [querier]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await querierRef.current();
        if (isMounted) {
          setData(result);
        }
      } catch (error) {
        console.error("Error in useLiveQuery:", error);
      }
    };

    fetchData();

    const unsubscribe = subscribeToDbChanges(() => {
      fetchData();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, deps);

  return data;
}
