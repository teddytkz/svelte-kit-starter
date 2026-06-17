import { getQueryClient } from '$lib/query-client';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = () => {
	const queryClient = getQueryClient();
	return { queryClient };
};
