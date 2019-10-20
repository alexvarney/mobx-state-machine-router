import {
  observable,
  action,
  computed,
  extendObservable,
  toJS,
  observe
} from 'mobx';
import { Persistence } from './persistence';

const transition = (
  states: States,
  curState: string,
  actionName: string
): string => {
  const result = states[curState].actions[actionName];

  return result;
};

interface Actions {
  [actionName: string]: string;
}

interface State {
  actions: Actions;
  url?: string;
}

export interface States {
  [stateName: string]: State;
}

interface Query {
  [param: string]: string | number;
}

interface Params {
  states: States;
  startState?: string;
  query?: Query;
  persistence?: Persistence;
}

interface ReverseRoutes {
  [param: string]: string;
}

interface CurrentState {
  name: string;
  params: object;
}

class MobxStateMachineRouter {
  @observable.ref currentState: CurrentState = <CurrentState>{
    name: '',
    params: <object>{}
  };

  persistence: Persistence = <Persistence>{};

  _startState: string = 'HOME';

  _startParams: Query = <Query>{};

  _states: States = <States>{};

  _reverseRoutes: ReverseRoutes = <ReverseRoutes>{};

  @computed
  get state(): string {
    return this.currentState.name;
  }

  @action.bound
  _setCurrentState(newState: CurrentState) {
    const _newStateName = newState.name;
    if (typeof this._states[_newStateName] !== 'undefined') {
      const params = { ...newState.params };
      // update/remove existing props
      for (const key in toJS(this.currentState.params)) {
        // if param value is null or undefined in new query
        if (params[key] == null) {
          this.currentState.params[key] = this._startParams[key];
        } else {
          this.currentState.params[key] = params[key];
        }
        delete params[key];
      }
      // add new props
      for (const key in params) {
        extendObservable(this.currentState.params, {
          [key]: params[key]
        });
      }

      // only update the whole object if a new State exists
      if (this.currentState.name !== _newStateName) {
        this.currentState = {
          name: _newStateName,
          params: this.currentState.params
        };
      }
    } else {
      this.currentState = {
        name: Object.keys(this._states)[0],
        params: this.currentState.params
      };
    }
  }

  emit(actionName: string, query: object = {}) {
    // determine new state to transition to
    const newState = transition(this._states, this.state, actionName);

    if (newState != null) {
      // if a persistence layer exists, write to it, and expect to resolve internal state as a result
      if (typeof this.persistence.write === 'function') {
        this.persistence.write(
          {
            name: newState,
            params: { ...this.currentState.params, ...query }
          },
          this._states
        );
      } else {
        this._setCurrentState({
          name: newState,
          params: { ...this.currentState.params, ...query }
        });
      }
    }
  }

  constructor({
    states,
    startState = 'HOME',
    query = {},
    persistence
  }: Params) {
    this._states = states;
    this._startState = startState;
    this._startParams = query;
    if (persistence != null) {
      this.persistence = persistence;
    }
    this.emit = this.emit.bind(this);

    // add new props
    for (const key in query) {
      extendObservable(this.currentState.params, {
        [key]: query[key]
      });
    }

    // subscribe to persistence and set currentState
    if (this.persistence && this.persistence.currentState != null) {
      for (const i in states) {
        const route = states[i].url;
        this._reverseRoutes[route.toLowerCase()] = i;
      }

      this.persistence.listen(() => {
        const { name, params } = this.persistence.currentState;
        const route = this._reverseRoutes[name];
        if (route != null) {
          this._setCurrentState({
            params: { ...query, ...params },
            name: route
          });
        }
      });
      const route = this._reverseRoutes[this.persistence.currentState.name];
      if (route != null) {
        this._setCurrentState({
          params: { ...query, ...this.persistence.currentState.params },
          name: route
        });
      } else {
        // ignore invalid starting URLs and params
        this._setCurrentState({
          name: startState,
          params: query
        });
      }
    } else {
      this._setCurrentState({
        name: startState,
        params: query
      });
    }
  }
}
export { default as URLPersistence } from '../../url-persistence/src';
export default MobxStateMachineRouter;