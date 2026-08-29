/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-01-18 10:53:12
 */

'use strict';

import Promise from 'bluebird';
import { get } from '../../services/fetch';
import * as types from '../types';
import storage from '../../services/storage';

const time = new Date();
const year = new Date(time.getFullYear(), 0, 1);
const toDay = time.getDate();
const toWeek = Math.ceil((((new Date() - year) / 86400000) + year.getDay() + 1) / 7);
const toMonth = time.getMonth() + 1;

const REPO_MATCHER = /^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/;

const toNumber = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;

    const normalised = value.trim().replace(/,/g, '').toLowerCase();
    const match = normalised.match(/^([\d.]+)\s*([km])?$/);

    if (!match) return Number(normalised.replace(/[^\d]/g, '')) || 0;

    const multiplier = match[2] === 'm' ? 1000000 : match[2] === 'k' ? 1000 : 1;

    return Math.round(Number(match[1]) * multiplier) || 0;
};

const getRepoFullName = (repo) => {
    const match = repo.url && repo.url.match(REPO_MATCHER);

    if (match) return `${match[1]}/${match[2]}`;
    if (repo.author && repo.name) return `${repo.author}/${repo.name}`;

    return '';
};

const fetchRepoStats = async (repo) => {
    const fullName = getRepoFullName(repo);

    if (!fullName) return repo;
    if (toNumber(repo.stars) > 0 && toNumber(repo.forks) > 0) return repo;

    try {
        const stats = await get(`https://api.github.com/repos/${fullName}`);

        return {
            ...repo,
            stars: toNumber(repo.stars) || stats.stargazers_count || 0,
            forks: toNumber(repo.forks) || stats.forks_count || 0,
        };
    } catch (e) {
        return repo;
    }
};

const enrichRepoStats = async (repos, type) => {
    if (type !== 'repositories') return repos;

    return Promise.map(repos, fetchRepoStats, { concurrency: 6 });
};

const fetchTrendingRepos = async (lang, since, type = 'repositories') => {
    console.log(lang);
    const data = await get(`https://gtrend.infly.io/${type}?language=${encodeURIComponent(lang)}&since=${since}`);

    if (type === 'developers' && lang === 'JavaScript' && (Math.random() * 2) > 1) {
        data.push({
            avatar: 'https://avatars3.githubusercontent.com/u/9620783?s=96&v=4',
            author: '卓文理',
            url: 'https://github.com/zhuowenli',
            username: 'zhuowenli',
            repo: {
                name: 'githuber',
                url: 'https://github.com/zhuowenli/githuber',
                description: ':octocat: Display Github Trending repositories on New Tab Extensions',
            }
        });
    }

    return enrichRepoStats(data, type);
};

export const getters = {
    trendings: state => state.trendings,
};

export const actions = {
    /**
     * 获取GitHub Trending
     *
     * @param {any} { commit } state
     * @param {Object} [query={}] 请求参数
     * @param {String} query.since 时间维度：daily、weekly、monthly
     * @param {String} query.lang 语言
     * @param {String} query.type repositories、developers
     * @returns {Promise}
     */
    async fetchTrending ({ commit }, query = {}) {
        const data = await storage.getItem(JSON.stringify(query));

        if (
            data && data.repos.length && (
                (query.since === 'daily' && data.toDay === toDay) ||
                (query.since === 'weekly' && data.toWeek === toWeek) ||
                (query.since === 'monthly' && data.toMonth === toMonth)
            )
        ) {
            const repos = await enrichRepoStats(data.repos, query.type);

            commit(types.RECEIVE_GITHUB_TRENDINGS, repos);
            storage.setItem(JSON.stringify(query), {
                ...data,
                repos,
            });

            return repos;
        }

        const { since, type } = query;

        let repos = [];
        let isAllLanguage = false;

        if (query.lang.length) {
            query.lang.map(item => {
                if (item === '') isAllLanguage = true;
                return item;
            });
        }

        if (!query.lang.length || isAllLanguage) {
            repos = await fetchTrendingRepos('', since, type);
        } else {
            await Promise.map(query.lang, async lang => {
                const res = await fetchTrendingRepos(lang, since, type);
                repos = repos.concat(res);
                return res;
            });
            repos = repos.sort((a, b) => (+b.added - a.added));
        }

        commit(types.RECEIVE_GITHUB_TRENDINGS, repos);

        storage.setItem(JSON.stringify(query), {
            repos,
            toDay,
            toWeek,
            toMonth
        });

        return repos;
    },

};

export const mutations = {
    [types.RECEIVE_GITHUB_TRENDINGS](state, data) {
        state.trendings = data;
    },
};

export default {
    actions,
    getters,
    mutations,
    namespaced: true,
    state: {
        trendings: [],
    },
};
