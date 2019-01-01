import * as daggy from 'daggy';
import './App.css';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import NumericInput from 'react-numeric-input';
import persist from 'react-localstorage-hoc';
import React, { Component } from 'react';
import ReactDataSheet from 'react-datasheet';
import 'react-datasheet/lib/react-datasheet.css';
import * as R from 'ramda';

// foldMap :: Monoid b -> (a -> b) -> [a] -> b
const foldMap = (m) => (f) =>
  R.reduce((b, a) => m.mappend(b, f(a)), m.zero);

// Obj Monoid
const ObjM = daggy.tagged('ObjM', ['x']);
ObjM.mappend = (ma, mb) => ObjM(R.merge(ma.x, mb.x));
ObjM.zero = ObjM({});

// Arr Monoid
const ArrM = daggy.tagged('ArrM', ['x']);
ArrM.mappend = (ma, mb) => ArrM(R.concat(ma.x, mb.x));
ArrM.zero = ArrM([]);

// Mult Monoid
const MultM = daggy.tagged('MultM', ['x']);
MultM.mappend = (ma, mb) => MultM(ma.x * mb.x);
MultM.zero = MultM(1);

// Add Monoid
const AddM = daggy.tagged('AddM', ['x']);
AddM.mappend = (ma, mb) => AddM(ma.x + mb.x);
AddM.zero = AddM(0);

// Tuple Monoid
/*const TupleM = (M1, M2) => {
  const r = daggy.tagged(
    `(${M1.toString()}, ${M2.toString()})`, 
    ['x', 'y']);
  r.mappend = (mma , mmb) => 
    r(M1.mappend(mma.x, mmb.x), 
       M2.mappend(mma.y, mmb.y));
  r.zero = r(M1.zero, M2.zero);
  return r;
}

const ArrObj = TupleM(ArrM, ObjM);*/

// Monoid v => Map[k, Monoid v] Monoid
const KV = (m) => {
  const r = daggy.tagged('K -> ' + m.toString(), ['x']);
  r.mappend = (kva , kvb) => 
    r(R.mergeWith((x, y) => m.mappend(x, y))(kva.x)(kvb.x));
  r.zero = r({});
  return r;
}

// Monoid Map[String, AddM]
const ObjAddM = KV(AddM);

/* data InputField v = 
  FCWeight string string v |
  ChWeight string v */
const InputField = daggy.taggedSum('InputField', {
  FCWeight: ['factor', 'concern', 'value'],
  FWeight: ['factor', 'value'],
  FCScore: ['factor', 'choice', 'value']
});

const storePath = {
  FCWeight: (factor, concern) => ['fcWeights', factor, concern],
  FWeight: choice => ['fWeights', choice],
  FCScore: (factor, choice) => ['fcScores', factor, choice]
};

const editorParams = {
  FCWeight: () => [0, 5],
  FWeight: () => [1, 5],
  FCScore: () => [-5, 5]
};

const fcWeightGrid = (state) =>
  R.map(c =>
   R.compose(
     R.prepend({readOnly: true, value: c}),
     R.append({readOnly: true, value: concernTotal(c, state)}))(
    R.map(f =>
     InputField.FCWeight(f, c, 
       R.pathOr(0)([f, c])(state.fcWeights)))(
     state.factors)))(
   state.concerns);

const fWeightRow = (state) =>
  R.compose(
    R.append({readOnly: true, value: ""}),
    R.prepend({readOnly: true, value: "Factor Weights"}))(
    R.map(
      (f) => InputField.FWeight(f, 
        R.propOr(1)(f)(state.fWeights)))(
      state.factors));

const breakDown = (fn) => (state) => 
  R.compose(
    R.map(R.zipObj(['name', 'value'])),
    R.toPairs,
    R.map(R.prop('x')))(
      foldMap(ObjAddM)(f =>
        ObjAddM(foldMap(ObjM)(c => 
          ObjM(R.objOf(c, AddM(MultM.mappend(
            MultM(R.pathOr(AddM.zero.x)([f, c])(state.fcWeights)),
            foldMap(MultM)(i => MultM(i))(fn(f))).x))))(
          state.concerns).x))(
        state.factors).x);

const choiceBreakdowns = (state) =>
  R.fromPairs(R.map(c => [c, breakDown(
      f => [R.propOr(1)(f)(state.fWeights),
            R.pathOr(0)([f, c])(state.fcScores)])(state)])(
    state.choices));

const concernBreakdown = (state) =>
  breakDown((f) => [R.propOr(1)(f)(state.fWeights)])(state);

const reduceTotal = (m) => (fn) => (state) => 
  foldMap(m)(f =>
    m(fn(f, R.propOr(1)(f)(state.fWeights))))(state.factors).x;

const rowTotal = (ix, sk, state) =>
  reduceTotal(AddM)((f, i) =>
    R.pathOr(0)([f, ix])(state[sk]) * i)(state);

const factorBreakdowns = (src, ix) => (state) =>
  foldMap(ObjM)(c => 
    ObjM(R.objOf(c,
      R.compose(
        R.map(R.zipObj(['name', 'value'])),
        R.toPairs)(
      R.map(R.prop('x'))(reduceTotal(ObjAddM)((f, i) =>
        R.objOf(f, AddM(i * R.pathOr(0)([f, c])(R.prop(ix)(state)))))(
        state))))))(R.prop(src)(state)).x;

const choiceFactorBreakdowns =
  factorBreakdowns('choices', 'fcScores');

const concernFactorBreakdowns =
  factorBreakdowns('concerns', 'fcWeights');

const choiceTotal = (c, state) =>
  rowTotal(c, 'fcScores', state);

const concernTotal = (c, state) =>
  rowTotal(c, 'fcWeights', state);

const choiceScores = (state) =>
  R.map(c =>
    R.compose(
      R.prepend({readOnly: true, value: `${c} Scores`}),
      R.append({readOnly: true, value: choiceTotal(c, state)}))(
        R.map((f) => InputField.FCScore(f, c,
          R.pathOr(0)([f, c])(state.fcScores)))(
        state.factors)))(
    state.choices);

const headers = (state) =>
  R.compose(
    R.prepend({readOnly: true, width: '10em', value: ""}),
    R.append({readOnly: true, width: '10em', value: "Totals"}))(
    R.map((f) => ({readOnly: true, width: '10em', value: f}))(state.factors));

const sep = (state) =>
  R.repeat({readOnly: true, value: ""})(state.factors.length + 2);

const grid = (state) =>
  R.compose(
    R.prepend(headers(state)), 
    R.prepend(sep(state)),
    R.flip(R.concat)(choiceScores(state)),
    R.append(sep(state)),
    R.append(fWeightRow(state)),
    R.append(sep(state)))(fcWeightGrid(state));

// factorXParse :: string -> [factor] -> [number] -> 
//    Map[factor -> Map[string -> number]]
const factorXParse = (c, vs, fs) =>
  R.reduce((a, e) => 
    R.assocPath([e[0], c])(e[1])(a))({})(R.zip(fs, vs));

// TODO - when does IO become a thing?
// parseCvRows :: [[string]] => (state - colors)
const parseCsvRows = (rows) => {
  if (R.head(R.head(rows)) !== "")
    throw new Error("First column must be row labels \n" +
      "Top left cell must be blank");
  const factors = R.tail(R.head(rows));
  const [concerns, choices] = R.splitWhen(
    R.compose(
      R.equals("factor weights"),
      R.toLower))(
    R.map(R.head)(R.tail(rows)));
  if (R.isEmpty(choices))
    throw new Error("No choices found. \n" +
      "Concerns and choices must be separated by a " + 
      "factor weight row, and the row must be labeled " +
      "Factor Weights");
  const parseGrid = R.compose(
    R.reduce(R.mergeDeepRight, {}),
    R.map(R.compose(
      R.apply(factorXParse),
      R.append(factors),
      R.juxt([R.head, R.tail]))));
  const fcWeights = parseGrid(R.take(concerns.length)(R.tail(rows)));
  const fcScores = parseGrid(R.compose(
    R.take(choices.length - 1),
    R.drop(concerns.length + 1))(R.tail(rows)));
  const fWeights = R.fromPairs(
    R.compose(R.zip(factors), R.tail)(rows[concerns.length+1]));
  return {
    factors, concerns, 
    choices: R.tail(choices),
    fcWeights, fWeights, fcScores};
}

const parseCsv = (string) => 
  parseCsvRows(string.split("\n").map(R.invoker(1, 'split')(",")));

const log = R.tap(console.log);
class ImportField extends Component {
  state = {
    value: ""
  }
  render() {
    return (<div>
      <textarea 
        value={this.state.value}
        onChange={(e) => this.setState({value: e.target.value})}
      />
      <button onClick={() => this.props.onSubmit(this.state.value)}>
        Import CSV
      </button>
    </div>);
  }
}

class App extends Component {
  colors = R.map(_ => 
    '#'+Math.floor(Math.random()*16777215).toString(16))(
    R.repeat(null)(100));

  state = {
    factors: ['foo', 'bar'],
    concerns: ['baz', 'quux'],
    choices: ['a', 'b'],
    fcWeights: {},
    fWeights: {},
    fcScores: {},
    colors: () => this.colors
  };

  render() {
    const factorDistribution = R.merge(
      choiceFactorBreakdowns(this.state),
      concernFactorBreakdowns(this.state));
    const concernShareByChoice = choiceBreakdowns(this.state);
    return (
      <div className="App">
        <ImportField
          onSubmit={(v) => this.setState(parseCsv(v))} />
        <ReactDataSheet
          data={grid(this.state)}
          width={10}
          valueRenderer={R.prop('value')}
          dataEditor={(props) => {
            const [min, max] = props.cell.cata(editorParams);
            return (<NumericInput min={min} max={max} step={1} 
              value={props.value}
              onChange={(v) => 
                props.onChange(R.max(min, R.min(max, v)))} />); }}
          onCellsChanged={changes => {
            const upd = foldMap(ObjM)((o) =>
              ObjM(R.set(
                R.lensPath(o.cell.cata(storePath)), 
                parseInt(o.value))({})))(changes);
            this.setState(R.mergeDeepRight(
              this.state,
              upd.x));
          }}
        />
        <div style={{marginTop: '2em', display: 'flex'}}>
          <div style={{width: '450px'}}>
            <b>Weighted Concerns</b>
          </div>
          <div>
            <b>Concern distribution</b>
            <div style={{display: 'flex'}}>
              {this.state.choices.map((e, i) =>
                (<div key={`cdl-${i}`} style={{width: '150px'}}>
                  <b>{e}</b>
                </div>))}
            </div>
          </div>
        </div>
        <div style={{
            display: 'flex',
            minWidth: '30em', 
            minHeight: '11em'}}>
          <PieChart width={300} height={150}>
            <Pie 
              data={concernBreakdown(this.state)} 
              dataKey='value'
              label
              cx={150} cy={50} innerRadius={10} 
              outerRadius={20} fill="#82ca9d">
                {concernBreakdown(this.state)
                  .map((_, i) => 
                    (<Cell key={i}
                      fill={this.colors[i % this.colors.length]}
                     />))}
            </Pie>
            <Legend />
          </PieChart>
          <PieChart width={800} height={150}>
            {R.toPairs(concernShareByChoice).map((e, i) =>
              (<Pie key={`cb-${i}`}
                data={e[1]}
                dataKey='value'
                label
                cx={200+(150*i)} cy={50} innerRadius={10} 
                outerRadius={20} fill="#82ca9d">
                  {e[1].map((_, i) => 
                      (<Cell  key={`c-${i}`}
                        fill={this.colors[i % this.colors.length]}
                       />))}
              </Pie >))}
            <Tooltip />
           </PieChart>
        </div>
        <div style={{marginTop: '2em'}}>
          <div><b>Concern share by choice</b></div>
          <div style={{display: 'flex'}}>
            {this.state.concerns.map((e, i) =>
              (<div key={`csbcl-${i}`} style={{width: '150px'}}>
                <b>{e}</b>
              </div>))}
          </div>
        </div>
        <div style={{
            display: 'flex',
            minWidth: '30em', 
            minHeight: '11em'}}>
          <PieChart width={800} height={150}>
            {this.state.concerns.map((e, i) =>
              (<Pie key={`cchb-${i}`}
                data={R.map(ch => 
                  R.assoc('name', ch)(R.find(R.propEq('name', e))(
                    concernShareByChoice[ch])))(this.state.choices)}
                dataKey='value'
                label
                cx={50+(150*i)} cy={50} innerRadius={10} 
                outerRadius={20} 
                fill={this.colors[i % this.colors.length]} />))}
            <Tooltip />
           </PieChart>
        </div>
        <div style={{marginTop: '2em'}}>
          <div style={{marginBottom: '1em'}}>
            <b>Factor distribution</b>
          </div>
          <div style={{display: 'flex'}}>
            <div style={{marginRight: '150px'}} />
            {R.concat(this.state.choices, this.state.concerns)
             .map((e, i) =>
              (<div key={`fdl-${i}`} 
                style={{marginRight: '250px'}}>
                <b>{e}</b>
              </div>))}
          </div>
        </div>
        <div style={{
            display: 'flex',
            minWidth: '30em', 
            minHeight: '15em'}}>
          <PieChart width={4600} height={250}>
            {R.concat(this.state.choices, this.state.concerns).map((e, i) =>
              (<Pie key={`fd-${i}`}
                data={factorDistribution[e]}
                dataKey='value'
                label
                cx={150+(300*i)} cy={100} innerRadius={30} 
                outerRadius={55} 
                fill={this.colors[i - 2 % this.colors.length]} />))}
            <Tooltip />
           </PieChart>
        </div>
      </div>
    );
  }
}

export default persist(App);
